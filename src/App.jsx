import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';

import MainLayout from './layouts/MainLayout';
import Dashboard from './pages/Dashboard';
import Classes from './pages/Classes';
import ClassDetails from './pages/ClassDetails';
import Admission from './pages/Admission';
import Login from './pages/Login';

function App() {
  const [user, setUser] = useState(() => {
    const manualSession = localStorage.getItem('manual_session');
    return manualSession ? JSON.parse(manualSession) : null;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        // Check if there's a manual bypass session
        const manualSession = localStorage.getItem('manual_session');
        if (manualSession) {
          setUser(JSON.parse(manualSession));
        } else {
          setUser(null);
        }
      } else {
        setUser(currentUser);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
        <div className="brand-icon animate-pulse" style={{ width: '80px', height: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '20px', background: 'linear-gradient(135deg, #4f46e5, #06b6d4)' }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={!user ? <Login /> : <Navigate to="/" />} />

      <Route path="/" element={user ? <MainLayout /> : <Navigate to="/login" />}>
        <Route index element={<Dashboard />} />
        <Route path="admission" element={<Admission />} />
        <Route path="classes" element={<Classes />} />
        <Route path="classes/:classId" element={<ClassDetails />} />
        <Route path="teachers" element={<div className="card"><h2>Teachers Page</h2></div>} />
        <Route path="parents" element={<div className="card"><h2>Parents Page</h2></div>} />
        <Route path="collections" element={<div className="card"><h2>Collections Page</h2></div>} />
        <Route path="promotions" element={<div className="card"><h2>Promotions Page</h2></div>} />
        <Route path="users" element={<div className="card"><h2>User Admin Page</h2></div>} />
      </Route>
    </Routes>
  );
}

export default App;
