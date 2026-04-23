const fs = require('fs');

let code = fs.readFileSync('c:/School V5/principal-app/src/pages/Admission.jsx', 'utf8');

// Inject testReceipt
const testReceiptCode = `
    const testReceipt = () => {
        setReceiptData({
            schoolName: localStorage.getItem('schoolName') || 'Sample High School',
            schoolLogo: localStorage.getItem('schoolLogo') || '',
            date: new Date().toLocaleDateString(),
            time: new Date().toLocaleTimeString(),
            parentName: 'John Doe',
            parentPhone: '+1 234 567 8900',
            parentEmail: 'johndoe@example.com',
            parentPassword: 'SecurePassword123!',
            students: [
                {
                    name: 'ALEX DOE',
                    className: 'Class 5',
                    rollNo: 'TPP-4592',
                    admissionNo: 'ADM-2026-001',
                    feeStructure: [
                        { id: '1', name: 'Tuition Fee', amount: 5000 },
                        { id: '2', name: 'Transport Fee', amount: 2000 }
                    ],
                    individualActions: [
                        { id: '3', name: 'Admission Fee', amount: 10000 },
                        { id: '4', name: 'Uniform', amount: 3500 }
                    ]
                }
            ]
        });
        setShowReceipt(true);
    };
`;

code = code.replace(/        \} finally \{\s*setIsLoading\(false\);\s*\}\s*\};\s*return \(/, `        } finally { setIsLoading(false); } };\n${testReceiptCode}\n    return (`);


// Update Header Button
code = code.replace(/<button className="submit-btn" onClick=\{handleSubmit\} disabled=\{isLoading\}>\s*\{isLoading \? <Loader2 size=\{20\} className="animate-spin" \/> : <Save size=\{20\} \/>\}\s*<span>\{isLoading \? 'Processing\.\.\.' : 'Complete Admission'\}<\/span>\s*<\/button>/g, 
`<div style={{ display: 'flex', gap: '1rem' }}>
                        <button type="button" className="submit-btn" onClick={testReceipt} style={{ background: '#64748b' }}>
                            <Printer size={20} />
                            <span>Test Receipt</span>
                        </button>
                        <button className="submit-btn" onClick={handleSubmit} disabled={isLoading}>
                            {isLoading ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
                            <span>{isLoading ? 'Processing...' : 'Complete Admission'}</span>
                        </button>
                    </div>`);

// Update Receipt Design
const oldReceiptMarker = '<div id="admission-receipt"';
const parts = code.split(oldReceiptMarker);

const newReceiptDesign = `
                    <div id="admission-receipt" className="animate-fade-in-up" style={{
                        background: 'white', color: '#1e293b', width: '100%', maxWidth: '850px',
                        minHeight: '1100px', position: 'relative', filter: 'drop-shadow(0 25px 35px rgba(0,0,0,0.4))',
                        display: 'flex', flexDirection: 'column', margin: '0 auto',
                        boxShadow: '0 0 0 1px rgba(0,0,0,0.05)'
                    }}>
                        <div style={{
                            height: '16px', background: 'linear-gradient(-45deg, transparent 11px, white 0), linear-gradient(45deg, transparent 11px, white 0)',
                            backgroundPosition: 'left-bottom', backgroundSize: '22px 22px', backgroundRepeat: 'repeat-x', marginBottom: '-1px'
                        }}></div>

                        <div style={{ padding: '4rem', flex: 1, background: 'white', display: 'flex', flexDirection: 'column' }}>
                            <div style={{ textAlign: 'center', marginBottom: '3rem', borderBottom: '3px solid #f1f5f9', paddingBottom: '2rem' }}>
                                {receiptData.schoolLogo ? (
                                    <img src={receiptData.schoolLogo} alt="Logo" style={{ width: '100px', height: '100px', objectFit: 'contain', margin: '0 auto 1rem' }} />
                                ) : (
                                    <School size={80} color="#3b82f6" style={{ margin: '0 auto 1rem' }} />
                                )}
                                <h2 style={{ fontSize: '2rem', fontWeight: '800', margin: '0 0 0.5rem', color: '#0f172a', letterSpacing: '-0.5px' }}>{receiptData.schoolName.toUpperCase()}</h2>
                                <p style={{ fontSize: '1.1rem', margin: 0, color: '#64748b', fontWeight: '600', letterSpacing: '2px' }}>OFFICIAL ADMISSION RECORD</p>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '3rem' }}>
                                <div style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                    <h4 style={{ margin: '0 0 1rem', fontSize: '0.9rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px' }}>Transaction Details</h4>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '1.05rem' }}><span style={{ color: '#475569' }}>Date:</span> <span style={{ fontWeight: '600' }}>{receiptData.date}</span></div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.05rem' }}><span style={{ color: '#475569' }}>Time:</span> <span style={{ fontWeight: '600' }}>{receiptData.time}</span></div>
                                </div>
                                <div style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                    <h4 style={{ margin: '0 0 1rem', fontSize: '0.9rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px' }}>Parent Account</h4>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '1.05rem' }}><span style={{ color: '#475569' }}>Name:</span> <span style={{ fontWeight: '700', color: '#0f172a' }}>{receiptData.parentName}</span></div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.05rem' }}><span style={{ color: '#475569' }}>Contact:</span> <span style={{ fontWeight: '600' }}>{receiptData.parentPhone}</span></div>
                                </div>
                            </div>

                            <div style={{ background: '#eff6ff', padding: '2rem', borderRadius: '12px', border: '2px solid #bfdbfe', marginBottom: '3rem', textAlign: 'center' }}>
                                <h3 style={{ margin: '0 0 1rem', color: '#1e40af', fontSize: '1.2rem', fontWeight: '800' }}>Parent Portal Login Credentials</h3>
                                <p style={{ margin: '0 0 1.5rem', color: '#3b82f6', fontSize: '0.95rem' }}>Please keep these credentials safe. You will use them to log into the Parent App.</p>
                                <div style={{ display: 'flex', justifyContent: 'center', gap: '3rem' }}>
                                    <div style={{ textAlign: 'left' }}>
                                        <span style={{ fontSize: '0.85rem', color: '#60a5fa', textTransform: 'uppercase', fontWeight: '700' }}>Login Email</span>
                                        <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#1e3a8a', fontFamily: 'monospace', marginTop: '0.25rem', background: 'white', padding: '0.5rem 1rem', borderRadius: '6px', border: '1px solid #93c5fd' }}>
                                            {receiptData.parentEmail || 'N/A'}
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'left' }}>
                                        <span style={{ fontSize: '0.85rem', color: '#60a5fa', textTransform: 'uppercase', fontWeight: '700' }}>Password</span>
                                        <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#1e3a8a', fontFamily: 'monospace', marginTop: '0.25rem', background: 'white', padding: '0.5rem 1rem', borderRadius: '6px', border: '1px solid #93c5fd' }}>
                                            {receiptData.parentPassword || 'N/A'}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div style={{ flex: 1 }}>
                                <h3 style={{ fontSize: '1.3rem', color: '#0f172a', fontWeight: '800', borderBottom: '2px solid #e2e8f0', paddingBottom: '0.75rem', marginBottom: '1.5rem' }}>Enrolled Students & Fees</h3>
                                {receiptData.students.map((stu, i) => (
                                    <div key={i} style={{ marginBottom: '2.5rem', padding: '1.5rem', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                                            <div>
                                                <h4 style={{ fontSize: '1.25rem', fontWeight: '800', margin: '0 0 0.25rem', color: '#0f172a' }}>{stu.name.toUpperCase()}</h4>
                                                <div style={{ fontSize: '1rem', color: '#64748b', fontWeight: '500' }}>Class: {stu.className}</div>
                                            </div>
                                            <div style={{ textAlign: 'right', fontSize: '0.95rem' }}>
                                                <div style={{ color: '#475569', marginBottom: '0.25rem' }}>Roll No: <span style={{ fontWeight: '700', color: '#0f172a' }}>{stu.rollNo || 'N/A'}</span></div>
                                                <div style={{ color: '#475569' }}>Admission No: <span style={{ fontWeight: '700', color: '#0f172a' }}>{stu.admissionNo || 'N/A'}</span></div>
                                            </div>
                                        </div>
                                        
                                        <table style={{ width: '100%', fontSize: '1.05rem', borderCollapse: 'collapse' }}>
                                            <thead>
                                                <tr style={{ borderBottom: '2px solid #cbd5e1' }}>
                                                    <th style={{ textAlign: 'left', padding: '0.75rem 0', color: '#64748b', fontWeight: '700', fontSize: '0.9rem', textTransform: 'uppercase' }}>Fee Description</th>
                                                    <th style={{ textAlign: 'right', padding: '0.75rem 0', color: '#64748b', fontWeight: '700', fontSize: '0.9rem', textTransform: 'uppercase' }}>Amount</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {stu.feeStructure.map(fee => (
                                                    <tr key={fee.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                        <td style={{ padding: '1rem 0', color: '#334155', fontWeight: '500' }}>{fee.name}</td>
                                                        <td style={{ textAlign: 'right', padding: '1rem 0', fontWeight: '700', color: '#0f172a' }}>Rs {fee.amount.toLocaleString()}</td>
                                                    </tr>
                                                ))}
                                                {stu.individualActions.map(act => (
                                                    <tr key={act.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                        <td style={{ padding: '1rem 0', color: '#334155', fontWeight: '500' }}>{act.name} <span style={{ fontSize: '0.8rem', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', marginLeft: '6px', color: '#64748b' }}>Action</span></td>
                                                        <td style={{ textAlign: 'right', padding: '1rem 0', fontWeight: '700', color: '#0f172a' }}>Rs {act.amount.toLocaleString()}</td>
                                                    </tr>
                                                ))}
                                                {(stu.feeStructure.length === 0 && stu.individualActions.length === 0) && (
                                                    <tr><td colSpan="2" style={{ padding: '1rem 0', fontStyle: 'italic', color: '#94a3b8', textAlign: 'center' }}>No fees assigned during admission</td></tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                ))}
                            </div>

                            <div style={{ marginTop: 'auto', paddingTop: '3rem', textAlign: 'center' }}>
                                <div style={{ width: '60px', height: '4px', background: '#3b82f6', margin: '0 auto 1.5rem', borderRadius: '2px' }}></div>
                                <h3 style={{ fontSize: '1.4rem', fontWeight: '800', color: '#0f172a', margin: '0 0 0.5rem' }}>Welcome to Our School Family!</h3>
                                <p style={{ fontSize: '1.05rem', color: '#64748b', margin: '0 0 0.5rem', lineHeight: '1.6' }}>
                                    Thank you for choosing us for your child's education.<br/>
                                    We are committed to providing the best learning environment.
                                </p>
                            </div>
                        </div>

                        <div style={{
                            height: '16px', background: 'linear-gradient(135deg, transparent 11px, white 0), linear-gradient(-135deg, transparent 11px, white 0)',
                            backgroundPosition: 'left-top', backgroundSize: '22px 22px', backgroundRepeat: 'repeat-x', marginTop: '-1px'
                        }}></div>

                        <div className="no-print" style={{ position: 'absolute', top: '20px', right: '-80px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <button onClick={() => setShowReceipt(false)} style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#ef4444', color: 'white', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 4px 6px rgba(0,0,0,0.3)', transition: 'transform 0.2s' }} onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.1)'} onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}>
                                <X size={28} />
                            </button>
                            <button onClick={() => window.print()} style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#3b82f6', color: 'white', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 4px 6px rgba(0,0,0,0.3)', transition: 'transform 0.2s' }} onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.1)'} onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}>
                                <Printer size={24} />
                            </button>
                            <button onClick={() => window.print()} style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#10b981', color: 'white', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 4px 6px rgba(0,0,0,0.3)', transition: 'transform 0.2s' }} onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.1)'} onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}>
                                <Download size={24} />
                            </button>
                        </div>
                    </div>

                    <style>{`
                        @media print {
                            body * {
                                visibility: hidden;
                            }
                            #admission-receipt, #admission-receipt * {
                                visibility: visible;
                            }
                            #admission-receipt {
                                position: absolute;
                                left: 0;
                                top: 0;
                                width: 100%;
                                max-width: none;
                                filter: none !important;
                                margin: 0;
                                padding: 0;
                                box-shadow: none !important;
                            }
                            .no-print {
                                display: none !important;
                            }
                        }
                    \`}</style>
                </div>
`;

if (parts.length > 1) {
    const endPart = parts[1].split('</style>')[1];
    code = parts[0] + newReceiptDesign + endPart;
    fs.writeFileSync('c:/School V5/principal-app/src/pages/Admission.jsx', code);
    console.log('Successfully updated file.');
} else {
    console.error('Marker not found');
}
