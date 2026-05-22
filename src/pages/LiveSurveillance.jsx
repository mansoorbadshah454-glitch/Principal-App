import React, { useState, useEffect, useRef } from 'react';
import { Cctv, Plus, X, AlertTriangle, Loader2, Save, Video, Tv, HelpCircle, Pencil, Trash2, ChevronDown, Camera } from 'lucide-react';
import { db, auth } from '../firebase';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';

// ── Styles ──────────────────────────────────────────────────────────────────
const S = {
  input: { width:'100%', padding:'0.45rem 0.75rem', borderRadius:'6px', border:'1px solid #cbd5e1', fontSize:'0.85rem', outline:'none', fontFamily:'inherit', background:'white' },
  label: { display:'block', fontSize:'0.72rem', fontWeight:'600', color:'var(--text-muted)', marginBottom:'4px' },
  slotBox: { background:'#f8fafc', borderRadius:'12px', padding:'1rem', border:'1px solid #e2e8f0', display:'flex', flexDirection:'column', gap:'0.75rem' },
};

// ── HLS Player ────────────────────────────────────────────────────────────────
const HlsPlayer = ({ url, name }) => {
  const videoRef = useRef(null);
  const [status, setStatus] = useState('loading'); // loading | ready | error

  useEffect(() => {
    if (!url) { setStatus('error'); return; }
    setStatus('loading');
    let hls = null;

    const init = () => {
      const v = videoRef.current;
      if (!v) return;
      if (window.Hls?.isSupported()) {
        hls = new window.Hls({ lowLatencyMode: true });
        hls.loadSource(url);
        hls.attachMedia(v);
        hls.on(window.Hls.Events.MANIFEST_PARSED, () => { setStatus('ready'); v.play().catch(()=>{}); });
        hls.on(window.Hls.Events.ERROR, (_, d) => {
          if (d.fatal) { setStatus('error'); hls.destroy(); }
        });
      } else if (v.canPlayType('application/vnd.apple.mpegurl')) {
        v.src = url;
        v.onloadedmetadata = () => { setStatus('ready'); v.play().catch(()=>{}); };
        v.onerror = () => setStatus('error');
      } else setStatus('error');
    };

    if (!window.Hls) {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/hls.js@latest';
      s.async = true; s.onload = init; s.onerror = () => setStatus('error');
      document.body.appendChild(s);
    } else init();
    return () => hls?.destroy();
  }, [url]);

  return (
    <div style={{ position:'relative', width:'100%', height:'100%', background:'#090d16', borderRadius:'10px', overflow:'hidden' }}>
      <video ref={videoRef} muted playsInline controls style={{ width:'100%', height:'100%', objectFit:'cover', display: status==='ready'?'block':'none' }} />
      {status==='loading' && (
        <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'8px', color:'#94a3b8' }}>
          <Loader2 size={28} className="animate-spin" style={{ color:'var(--primary)' }} />
          <span style={{ fontSize:'0.8rem' }}>Connecting...</span>
        </div>
      )}
      {status==='error' && (
        <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'8px', color:'#f87171' }}>
          <AlertTriangle size={28} />
          <span style={{ fontSize:'0.82rem', fontWeight:'600' }}>Feed Offline</span>
        </div>
      )}
      {status==='ready' && (
        <div style={{ position:'absolute', bottom:'10px', left:'10px', background:'rgba(0,0,0,0.6)', color:'white', padding:'3px 10px', borderRadius:'6px', fontSize:'0.75rem', fontWeight:'600', display:'flex', alignItems:'center', gap:'6px', backdropFilter:'blur(4px)' }}>
          <span style={{ width:'7px', height:'7px', borderRadius:'50%', background:'#10b981', boxShadow:'0 0 6px #10b981', display:'inline-block' }} />
          {name||'Live'}
        </div>
      )}
    </div>
  );
};

// ── Empty Slot ────────────────────────────────────────────────────────────────
const EmptySlot = ({ num, onClick }) => (
  <div onClick={onClick} style={{ width:'100%', height:'100%', background:'var(--bg-main)', border:'2px dashed #cbd5e1', borderRadius:'10px', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'10px', color:'var(--text-muted)', cursor:'pointer', transition:'var(--transition)' }}
    onMouseEnter={e=>{ e.currentTarget.style.borderColor='var(--primary)'; e.currentTarget.style.color='var(--primary)'; }}
    onMouseLeave={e=>{ e.currentTarget.style.borderColor='#cbd5e1'; e.currentTarget.style.color='var(--text-muted)'; }}>
    <Cctv size={32} style={{ opacity:0.45 }} />
    <span style={{ fontSize:'0.85rem', fontWeight:'600' }}>Slot {num} Empty</span>
  </div>
);

// ── Modal Backdrop ────────────────────────────────────────────────────────────
const Modal = ({ onClose, children }) => (
  <div onClick={e=>{ if(e.target===e.currentTarget) onClose(); }} style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.65)', backdropFilter:'blur(6px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:99999, animation:'ls-fadeIn 0.18s ease-out' }}>
    <div style={{ width:'90%', maxWidth:'660px', background:'white', borderRadius:'22px', padding:'2rem', boxShadow:'0 25px 50px -12px rgba(0,0,0,0.3)', display:'flex', flexDirection:'column', gap:'1.25rem', border:'1px solid rgba(0,0,0,0.06)', animation:'ls-fadeUp 0.28s cubic-bezier(0.16,1,0.3,1) both', maxHeight:'90vh', overflow:'hidden' }}>
      {children}
    </div>
  </div>
);

// ── Camera Group Form (shared by Add & Edit modals) ───────────────────────────
const GroupForm = ({ initial, onSave, onClose, title }) => {
  const [groupName, setGroupName] = useState(initial?.groupName || '');
  const [cams, setCams] = useState(initial?.cameras || [{name:'',url:''},{name:'',url:''},{name:'',url:''},{name:'',url:''}]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const update = (i, field, val) => { const n=[...cams]; n[i][field]=val; setCams(n); };

  const submit = async e => {
    e.preventDefault();
    if (!groupName.trim()) { setErr('Group name is required.'); return; }
    for (let i=0;i<cams.length;i++) {
      if (cams[i].url && !cams[i].url.toLowerCase().includes('.m3u8')) { setErr(`Camera ${i+1}: URL must end with .m3u8`); return; }
      if (cams[i].url && !cams[i].name.trim()) { setErr(`Camera ${i+1}: Name is required when URL is set.`); return; }
    }
    setSaving(true);
    await onSave({ groupName: groupName.trim(), cameras: cams });
    setSaving(false);
  };

  return (
    <>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:'1px solid #f1f5f9', paddingBottom:'1rem', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
          <div style={{ width:'38px', height:'38px', borderRadius:'11px', background:'rgba(79,70,229,0.08)', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--primary)' }}><Cctv size={20}/></div>
          <div><h2 style={{ margin:0, fontSize:'1.15rem', fontWeight:'800', color:'var(--text-main)' }}>{title}</h2><span style={{ fontSize:'0.78rem', color:'var(--text-muted)' }}>Configure up to 4 camera streams per group.</span></div>
        </div>
        <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', padding:'6px', borderRadius:'8px', display:'flex', alignItems:'center' }} onMouseEnter={e=>e.currentTarget.style.background='#f1f5f9'} onMouseLeave={e=>e.currentTarget.style.background='none'}><X size={20}/></button>
      </div>

      {/* Group name */}
      <div style={{ flexShrink:0 }}>
        <label style={S.label}>Group / Location Name</label>
        <input style={{ ...S.input, fontWeight:'600' }} value={groupName} onChange={e=>setGroupName(e.target.value)} placeholder="e.g. Main Building, Block A, Ground Floor" />
      </div>

      {/* Tip */}
      <div style={{ background:'#eff6ff', borderLeft:'4px solid #3b82f6', borderRadius:'0 8px 8px 0', padding:'0.65rem 1rem', display:'flex', gap:'8px', fontSize:'0.78rem', color:'#1e3a8a', flexShrink:0 }}>
        <HelpCircle size={16} style={{ flexShrink:0, color:'#3b82f6', marginTop:'1px' }}/>
        <span><strong>Supported:</strong> HLS streams ending in <code>.m3u8</code> — e.g. <code>https://cam.school.com/class1.m3u8</code></span>
      </div>

      {err && <div style={{ background:'#fef2f2', border:'1px solid #fee2e2', borderRadius:'8px', padding:'0.65rem 1rem', color:'#b91c1c', fontSize:'0.83rem', display:'flex', gap:'8px', alignItems:'center', flexShrink:0 }}><AlertTriangle size={15}/>{err}</div>}

      {/* Scrollable slots */}
      <form onSubmit={submit} style={{ display:'flex', flexDirection:'column', gap:'0.9rem', overflow:'hidden', flex:1 }}>
        <div className="custom-scrollbar" style={{ overflowY:'auto', display:'flex', flexDirection:'column', gap:'0.9rem', flex:1, paddingRight:'4px' }}>
          {cams.map((cam,i)=>(
            <div key={i} style={S.slotBox}>
              <div style={{ display:'flex', alignItems:'center', gap:'6px', fontSize:'0.83rem', fontWeight:'700', color:'var(--text-main)' }}><Video size={14} color="var(--primary)"/><span>Camera Slot {i+1}</span></div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 2fr', gap:'0.65rem' }}>
                <div><label style={S.label}>Camera Name</label><input style={S.input} value={cam.name} onChange={e=>update(i,'name',e.target.value)} placeholder="e.g. Class 1 Cam" className="input-field"/></div>
                <div><label style={S.label}>HLS Stream URL (.m3u8)</label><input style={{ ...S.input, fontFamily: cam.url?'monospace':'inherit' }} value={cam.url} onChange={e=>update(i,'url',e.target.value)} placeholder="https://example.com/live.m3u8" className="input-field"/></div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ display:'flex', gap:'0.75rem', borderTop:'1px solid #f1f5f9', paddingTop:'1rem', justifyContent:'flex-end', flexShrink:0 }}>
          <button type="button" onClick={onClose} className="btn" style={{ background:'white', border:'1px solid #cbd5e1', color:'var(--text-main)', borderRadius:'8px', padding:'0.55rem 1.1rem', fontSize:'0.88rem' }}>Cancel</button>
          <button type="submit" disabled={saving} className="btn btn-primary" style={{ borderRadius:'8px', padding:'0.55rem 1.4rem', fontSize:'0.88rem' }}>
            {saving ? <><Loader2 className="animate-spin" size={15}/><span>Saving...</span></> : <><Save size={15}/><span>Save Group</span></>}
          </button>
        </div>
      </form>
    </>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────────
const LiveSurveillance = () => {
  const [groups, setGroups] = useState([]);
  const [activeGroupId, setActiveGroupId] = useState(null);
  const [schoolId, setSchoolId] = useState(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editGroup, setEditGroup] = useState(null);       // group object being edited
  const [selectorOpen, setSelectorOpen] = useState(false);
  const selectorRef = useRef(null);

  // Close selector on outside click
  useEffect(() => {
    const handler = e => { if (selectorRef.current && !selectorRef.current.contains(e.target)) setSelectorOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Load from localStorage + Firestore
  useEffect(() => {
    let sid = null;
    try { const s = localStorage.getItem('manual_session'); if(s){ sid = JSON.parse(s).schoolId; setSchoolId(sid); } } catch(e){}

    const local = localStorage.getItem('ls_camera_groups');
    if (local) {
      try {
        const parsed = JSON.parse(local);
        setGroups(parsed);
        if (parsed.length) setActiveGroupId(parsed[0].id);
      } catch(e){}
    }

    if (sid) {
      const ref = doc(db, `schools/${sid}/settings`, 'surveillance_v2');
      const unsub = onSnapshot(ref, snap => {
        if (snap.exists()) {
          const g = snap.data().groups || [];
          setGroups(g);
          setActiveGroupId(prev => g.find(x=>x.id===prev) ? prev : (g[0]?.id||null));
          localStorage.setItem('ls_camera_groups', JSON.stringify(g));
        }
        setInitialLoading(false);
      }, () => setInitialLoading(false));
      return () => unsub();
    } else setInitialLoading(false);
  }, []);

  const persist = async newGroups => {
    setGroups(newGroups);
    localStorage.setItem('ls_camera_groups', JSON.stringify(newGroups));
    if (schoolId && auth.currentUser) {
      try { await setDoc(doc(db,`schools/${schoolId}/settings`,'surveillance_v2'), { groups: newGroups }, { merge:true }); } catch(e){}
    }
  };

  const handleAdd = async ({ groupName, cameras }) => {
    const newGroup = { id: `grp_${Date.now()}`, groupName, cameras };
    const next = [...groups, newGroup];
    await persist(next);
    setActiveGroupId(newGroup.id);
    setShowAddModal(false);
  };

  const handleEdit = async ({ groupName, cameras }) => {
    const next = groups.map(g => g.id===editGroup.id ? { ...g, groupName, cameras } : g);
    await persist(next);
    setEditGroup(null);
  };

  const handleDelete = async id => {
    if (!window.confirm('Delete this camera group?')) return;
    const next = groups.filter(g=>g.id!==id);
    await persist(next);
    setActiveGroupId(next[0]?.id||null);
  };

  // Jump to camera: find its group and switch to it
  const jumpToCamera = (groupId) => {
    setActiveGroupId(groupId);
    setSelectorOpen(false);
  };

  const activeGroup = groups.find(g=>g.id===activeGroupId) || null;

  // All named cameras for the selector (flat list)
  const allNamedCameras = groups.flatMap(g =>
    g.cameras.filter(c=>c.name).map(c=>({ camName: c.name, groupId: g.id, groupName: g.groupName }))
  );

  if (initialLoading) return (
    <div style={{ display:'flex', justifyContent:'center', alignItems:'center', height:'60vh' }}>
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'1rem' }}>
        <Loader2 className="animate-spin" size={36} color="var(--primary)"/>
        <span style={{ color:'var(--text-muted)', fontSize:'0.9rem' }}>Initializing surveillance...</span>
      </div>
    </div>
  );

  return (
    <>
      <style>{`
        @keyframes ls-fadeUp { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
        @keyframes ls-fadeIn { from{opacity:0} to{opacity:1} }
        .ls-tab { padding:0.45rem 1rem; border-radius:8px; border:1px solid #e2e8f0; background:white; font-size:0.83rem; font-weight:600; cursor:pointer; transition:all 0.2s; color:var(--text-muted); display:flex; align-items:center; gap:6px; }
        .ls-tab:hover { border-color:var(--primary); color:var(--primary); }
        .ls-tab.active { background:var(--primary); color:white; border-color:var(--primary); box-shadow:0 4px 12px rgba(79,70,229,0.2); }
        .ls-tab-action { background:none; border:none; cursor:pointer; opacity:0.5; display:flex; align-items:center; padding:2px; border-radius:4px; transition:all 0.15s; }
        .ls-tab-action:hover { opacity:1; background:rgba(255,255,255,0.2); }
        .ls-sel-item { padding:0.55rem 1rem; cursor:pointer; font-size:0.85rem; display:flex; align-items:center; gap:8px; transition:background 0.15s; border-radius:6px; }
        .ls-sel-item:hover { background:#f1f5f9; }
      `}</style>

      {/* ══ PAGE WRAPPER ══ */}
      <div style={{ animation:'ls-fadeUp 0.4s cubic-bezier(0.16,1,0.3,1) both' }}>

        {/* ── Header ── */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'1.5rem', gap:'1rem', flexWrap:'wrap' }}>
          <div>
            <h1 style={{ fontSize:'2rem', fontWeight:'800', margin:0, color:'var(--text-main)' }}>Live Surveillance</h1>
            <p style={{ color:'var(--text-muted)', fontSize:'0.9rem', marginTop:'0.2rem' }}>Monitor live CCTV feeds across all campus locations.</p>
          </div>

          <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', flexWrap:'wrap' }}>
            {/* Camera Selector Dropdown */}
            {allNamedCameras.length > 0 && (
              <div ref={selectorRef} style={{ position:'relative' }}>
                <button
                  onClick={()=>setSelectorOpen(o=>!o)}
                  style={{ display:'flex', alignItems:'center', gap:'8px', padding:'0.55rem 1rem', background:'white', border:'1px solid #cbd5e1', borderRadius:'10px', cursor:'pointer', fontSize:'0.85rem', fontWeight:'600', color:'var(--text-main)', boxShadow:'var(--shadow-sm)', transition:'all 0.2s' }}
                  onMouseEnter={e=>{ e.currentTarget.style.borderColor='var(--primary)'; e.currentTarget.style.color='var(--primary)'; }}
                  onMouseLeave={e=>{ e.currentTarget.style.borderColor='#cbd5e1'; e.currentTarget.style.color='var(--text-main)'; }}
                >
                  <Camera size={16}/>
                  <span>Jump to Camera</span>
                  <ChevronDown size={15} style={{ transition:'transform 0.2s', transform: selectorOpen?'rotate(180deg)':'rotate(0deg)' }}/>
                </button>

                {selectorOpen && (
                  <div style={{ position:'absolute', right:0, top:'calc(100% + 8px)', background:'white', borderRadius:'14px', boxShadow:'0 10px 40px rgba(0,0,0,0.15)', border:'1px solid #e2e8f0', zIndex:500, minWidth:'240px', padding:'0.5rem', animation:'ls-fadeUp 0.15s ease-out' }}>
                    <div style={{ fontSize:'0.7rem', fontWeight:'700', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.06em', padding:'0.3rem 0.75rem 0.5rem' }}>
                      All Cameras ({allNamedCameras.length})
                    </div>
                    {groups.map(g => {
                      const named = g.cameras.filter(c=>c.name);
                      if (!named.length) return null;
                      return (
                        <div key={g.id}>
                          <div style={{ fontSize:'0.72rem', fontWeight:'700', color:'var(--primary)', padding:'0.3rem 0.75rem', textTransform:'uppercase', letterSpacing:'0.04em' }}>{g.groupName}</div>
                          {named.map((c,i)=>(
                            <div key={i} className="ls-sel-item" onClick={()=>jumpToCamera(g.id)}>
                              <Tv size={14} color="var(--primary)"/>
                              <span>{c.name}</span>
                              {g.id===activeGroupId && <span style={{ marginLeft:'auto', fontSize:'0.68rem', background:'rgba(79,70,229,0.1)', color:'var(--primary)', padding:'1px 7px', borderRadius:'10px', fontWeight:'700' }}>Viewing</span>}
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Add Camera Group button */}
            <button
              onClick={()=>setShowAddModal(true)}
              className="btn btn-primary"
              style={{ borderRadius:'10px', padding:'0.55rem 1.1rem', fontSize:'0.88rem' }}
            >
              <Plus size={17}/>
              <span>Add Camera Group</span>
            </button>
          </div>
        </div>

        {/* ── Group Tabs (if multiple groups) ── */}
        {groups.length > 0 && (
          <div style={{ display:'flex', gap:'0.5rem', flexWrap:'wrap', marginBottom:'1.5rem', alignItems:'center' }}>
            {groups.map(g=>(
              <div key={g.id} style={{ display:'flex', alignItems:'center', gap:'4px' }}>
                <button className={`ls-tab${g.id===activeGroupId?' active':''}`} onClick={()=>setActiveGroupId(g.id)}>
                  <Cctv size={14}/>
                  {g.groupName}
                </button>
                {g.id===activeGroupId && (
                  <>
                    <button className="ls-tab-action" title="Edit Group" onClick={()=>setEditGroup(g)} style={{ color: 'var(--primary)' }}><Pencil size={13}/></button>
                    <button className="ls-tab-action" title="Delete Group" onClick={()=>handleDelete(g.id)} style={{ color:'var(--danger)' }}><Trash2 size={13}/></button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── STATE A: No groups yet ── */}
        {groups.length === 0 && (
          <div style={{ display:'flex', justifyContent:'center', alignItems:'center', minHeight:'420px' }}>
            <div className="card" style={{ maxWidth:'500px', width:'100%', textAlign:'center', padding:'3rem 2rem', boxShadow:'var(--shadow-lg)' }}>
              <div style={{ width:'80px', height:'80px', borderRadius:'24px', background:'rgba(79,70,229,0.07)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 1.5rem', color:'var(--primary)' }}>
                <Cctv size={40}/>
              </div>
              <h2 style={{ fontSize:'1.35rem', fontWeight:'700', color:'var(--text-main)', marginBottom:'0.75rem' }}>No Cameras Configured Yet</h2>
              <p style={{ color:'var(--text-muted)', fontSize:'0.92rem', lineHeight:'1.55', marginBottom:'2rem' }}>
                Add your first camera group to start monitoring campus locations. Each group supports up to 4 live CCTV streams.
              </p>
              <button onClick={()=>setShowAddModal(true)} className="btn btn-primary" style={{ width:'100%', justifyContent:'center', padding:'0.8rem 1.5rem', borderRadius:'var(--radius-md)', fontSize:'1rem' }}>
                <Plus size={20}/><span>Add First Camera Group</span>
              </button>
            </div>
          </div>
        )}

        {/* ── STATE C: Active Camera Grid ── */}
        {activeGroup && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(380px, 1fr))', gap:'1.25rem' }}>
            {activeGroup.cameras.map((cam, idx) => (
              <div key={idx} className="card" style={{ padding:'0.75rem', borderRadius:'16px', height:'300px', boxShadow:'var(--shadow-md)', display:'flex', flexDirection:'column', gap:'0.5rem', border:'1px solid rgba(0,0,0,0.04)' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'0.2rem 0.4rem' }}>
                  <span style={{ fontSize:'0.88rem', fontWeight:'700', color:'var(--text-main)', display:'flex', alignItems:'center', gap:'6px' }}>
                    <Tv size={15} color="var(--primary)"/>
                    {cam.name || `Slot ${idx+1} — Empty`}
                  </span>
                  {cam.url && <span style={{ fontSize:'0.68rem', fontWeight:'700', color:'var(--success)', background:'rgba(16,185,129,0.1)', padding:'2px 8px', borderRadius:'10px', textTransform:'uppercase' }}>Live</span>}
                </div>
                <div style={{ flex:1, borderRadius:'10px', overflow:'hidden' }}>
                  {cam.url
                    ? <HlsPlayer url={cam.url} name={cam.name}/>
                    : <EmptySlot num={idx+1} onClick={()=>setEditGroup(activeGroup)}/>
                  }
                </div>
              </div>
            ))}
          </div>
        )}

      </div>{/* ══ END PAGE WRAPPER ══ */}

      {/* ══ ADD MODAL ══ */}
      {showAddModal && (
        <Modal onClose={()=>setShowAddModal(false)}>
          <GroupForm title="Add Camera Group" onSave={handleAdd} onClose={()=>setShowAddModal(false)}/>
        </Modal>
      )}

      {/* ══ EDIT MODAL ══ */}
      {editGroup && (
        <Modal onClose={()=>setEditGroup(null)}>
          <GroupForm title={`Edit — ${editGroup.groupName}`} initial={editGroup} onSave={handleEdit} onClose={()=>setEditGroup(null)}/>
        </Modal>
      )}
    </>
  );
};

export default LiveSurveillance;
