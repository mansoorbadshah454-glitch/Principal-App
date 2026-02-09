import React, { useState, useEffect } from 'react';
import { Plus, Search, Shield } from 'lucide-react';
import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import UserCard from '../components/UserCard';
import AddAdminModal from '../components/AddAdminModal';

const Users = () => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [editingUser, setEditingUser] = useState(null);

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const session = localStorage.getItem('manual_session');
            if (session) {
                const { schoolId } = JSON.parse(session);
                // Fetch from school-specific collection
                const querySnapshot = await getDocs(collection(db, `schools/${schoolId}/admin_users`));
                const usersList = querySnapshot.docs
                    .map(doc => ({
                        id: doc.id,
                        ...doc.data()
                    }))
                    .filter(user => user.role === 'school Admin');
                setUsers(usersList);
            }
        } catch (error) {
            console.error("Error fetching admin users:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    const handleDelete = async (userId) => {
        if (window.confirm("Are you sure you want to remove this admin? This action cannot be undone.")) {
            try {
                const session = localStorage.getItem('manual_session');
                if (session) {
                    const { schoolId } = JSON.parse(session);
                    await deleteDoc(doc(db, `schools/${schoolId}/admin_users`, userId));
                    setUsers(users.filter(user => user.id !== userId));
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
            fetchUsers();
        }
    };

    const filteredUsers = users.filter(user =>
        user.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email?.toLowerCase().includes(searchTerm.toLowerCase())
    );

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

                    <button
                        onClick={handleAddUser}
                        className="btn btn-primary"
                    >
                        <Plus size={20} />
                        Add New Admin
                    </button>
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
                                {!searchTerm && (
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
