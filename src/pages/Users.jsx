import React, { useState, useEffect } from 'react';
import { Plus, Search, Shield, RotateCw } from 'lucide-react';
import { collection, getDocs, deleteDoc, doc, onSnapshot } from 'firebase/firestore';
import { getDocsFast } from '../utils/cacheUtils';
import { db } from '../firebase';
import UserCard from '../components/UserCard';
import AddAdminModal from '../components/AddAdminModal';

const Users = () => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [editingUser, setEditingUser] = useState(null);
    const [currentUserRole, setCurrentUserRole] = useState('principal');

    const fetchUsers = async (forceServer = false) => {
        setLoading(true);
        try {
            const session = localStorage.getItem('manual_session');
            if (session) {
                const { schoolId, role } = JSON.parse(session);
                setCurrentUserRole(role || 'principal');

                // Support both numeric (6257) and prefixed (SCHOOL_6257) paths
                const cleanId = String(schoolId).trim().replace(/^SCHOOL_/i, '');
                const fullId = `SCHOOL_${cleanId}`;
                const searchPaths = Array.from(new Set([String(schoolId).trim(), cleanId, fullId]));

                const userMap = new Map();
                for (const p of searchPaths) {
                    try {
                        const colRef = collection(db, `schools/${p}/admin_users`);
                        const querySnapshot = forceServer ? await getDocs(colRef) : await getDocsFast(colRef);
                        querySnapshot.docs.forEach(docSnap => {
                            const data = docSnap.data();
                            const r = (data.role || '').toLowerCase().trim();
                            if (r === 'school admin' || r === 'school_admin' || r === 'admin') {
                                userMap.set(docSnap.id, {
                                    id: docSnap.id,
                                    ...data
                                });
                            }
                        });
                    } catch (e) {
                        console.warn(`Path scan notice for ${p}:`, e.message);
                    }
                }

                setUsers(Array.from(userMap.values()));
            }
        } catch (error) {
            console.error("Error fetching admin users:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const session = localStorage.getItem('manual_session');
        if (!session) {
            setLoading(false);
            return;
        }

        const { schoolId, role } = JSON.parse(session);
        setCurrentUserRole(role || 'principal');

        const cleanId = String(schoolId).trim().replace(/^SCHOOL_/i, '');
        const fullId = `SCHOOL_${cleanId}`;
        const searchPaths = Array.from(new Set([String(schoolId).trim(), cleanId, fullId]));

        setLoading(true);
        const pathData = new Map();

        const updateCombinedUsers = () => {
            const combinedMap = new Map();
            pathData.forEach(docsList => {
                docsList.forEach(user => {
                    combinedMap.set(user.id, user);
                });
            });
            setUsers(Array.from(combinedMap.values()));
            setLoading(false);
        };

        const unsubs = searchPaths.map(p => {
            return onSnapshot(collection(db, `schools/${p}/admin_users`), (snapshot) => {
                const list = snapshot.docs
                    .map(docSnap => ({
                        id: docSnap.id,
                        ...docSnap.data()
                    }))
                    .filter(u => {
                        const r = (u.role || '').toLowerCase().trim();
                        return r === 'school admin' || r === 'school_admin' || r === 'admin';
                    });
                pathData.set(p, list);
                updateCombinedUsers();
            }, (err) => {
                console.warn(`Snapshot notice on ${p}:`, err.message);
                pathData.set(p, []);
                updateCombinedUsers();
            });
        });

        return () => {
            unsubs.forEach(unsub => unsub());
        };
    }, []);

    const handleDelete = async (userId) => {
        if (window.confirm("Are you sure you want to remove this admin? This action cannot be undone.")) {
            try {
                const session = localStorage.getItem('manual_session');
                if (session) {
                    const { schoolId } = JSON.parse(session);
                    const cleanId = String(schoolId).trim().replace(/^SCHOOL_/i, '');
                    const fullId = `SCHOOL_${cleanId}`;
                    const targetPaths = Array.from(new Set([String(schoolId).trim(), cleanId, fullId]));

                    // Remove from all variant paths so user never reappears
                    for (const p of targetPaths) {
                        await deleteDoc(doc(db, `schools/${p}/admin_users`, userId)).catch(() => {});
                        await deleteDoc(doc(db, `schools/${p}/users`, userId)).catch(() => {});
                    }
                    await deleteDoc(doc(db, 'global_users', userId)).catch(() => {});

                    setUsers(prev => prev.filter(user => user.id !== userId));
                    alert("Admin removed successfully.");
                }
            } catch (error) {
                console.error("Error deleting user:", error);
                alert("Failed to delete user.");
            }
        }
    };

    const handleEdit = (user) => {
        setEditingUser(user);
        setShowModal(true);
    };

    const handleAddUser = () => {
        setEditingUser(null);
        setShowModal(true);
    };

    const handleModalClose = (shouldRefresh = false) => {
        setShowModal(false);
        setEditingUser(null);
        if (shouldRefresh) {
            fetchUsers(true);
        }
    };

    const filteredUsers = users.filter(user => {
        const nameToSearch = (user.displayName || user.name || '').toLowerCase();
        const emailToSearch = (user.email || '').toLowerCase();
        const term = searchTerm.toLowerCase().trim();
        return nameToSearch.includes(term) || emailToSearch.includes(term);
    });

    return (
        <>
            <div className="animate-fade-in-up">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                            <Shield className="text-indigo-600" />
                            User Administration
                        </h1>
                        <p className="text-slate-500 mt-1">Manage system access and permissions for administrative staff.</p>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => fetchUsers(true)}
                            disabled={loading}
                            title="Refresh from server"
                            className="p-2.5 bg-white border border-slate-200 rounded-xl text-slate-600 hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50/50 transition-all shadow-xs disabled:opacity-50"
                        >
                            <RotateCw size={18} className={loading ? 'animate-spin text-indigo-600' : ''} />
                        </button>
                        {currentUserRole !== 'school Admin' && (
                            <button
                                onClick={handleAddUser}
                                className="btn btn-primary"
                            >
                                <Plus size={20} />
                                Add New Admin
                            </button>
                        )}
                    </div>
                </div>

                {/* Search and Filter Bar */}
                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 mb-6 flex flex-col sm:flex-row gap-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                        <input
                            type="text"
                            placeholder="Search admins by name or email..."
                            className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                {loading ? (
                    <div className="flex justify-center py-12">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
                    </div>
                ) : (
                    <>
                        {filteredUsers.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {filteredUsers.map(user => (
                                    <UserCard
                                        key={user.id}
                                        user={user}
                                        onDelete={handleDelete}
                                        onEdit={handleEdit}
                                        isPrincipal={currentUserRole !== 'school Admin'}
                                    />
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-12 bg-white rounded-xl border border-dashed border-slate-300">
                                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <Shield className="text-slate-300" size={32} />
                                </div>
                                <h3 className="text-lg font-medium text-slate-700">No admin users found</h3>
                                <p className="text-slate-500 max-w-md mx-auto mt-2">
                                    {searchTerm ? `No results found for "${searchTerm}"` : "Get started by adding your first administrative user."}
                                </p>
                                {(!searchTerm && currentUserRole !== 'school Admin') && (
                                    <button
                                        onClick={handleAddUser}
                                        className="mt-4 text-indigo-600 font-medium hover:text-indigo-700 hover:underline"
                                    >
                                        Create an Admin Account
                                    </button>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>

            {showModal && (
                <AddAdminModal
                    onClose={handleModalClose}
                    userToEdit={editingUser}
                    schoolId={(() => {
                        const session = localStorage.getItem('manual_session');
                        return session ? JSON.parse(session).schoolId : null;
                    })()}
                />
            )}
        </>
    );
};

export default Users;
