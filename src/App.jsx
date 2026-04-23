import React, { useState, useEffect, Suspense, lazy } from 'react';
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';

import MainLayout from './layouts/MainLayout';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Classes = lazy(() => import('./pages/Classes'));
const Teachers = lazy(() => import('./pages/Teachers'));
const Parents = lazy(() => import('./pages/Parents'));
const ClassDetails = lazy(() => import('./pages/ClassDetails'));
const Admission = lazy(() => import('./pages/Admission'));
const Login = lazy(() => import('./pages/Login'));
const Collections = lazy(() => import('./pages/Collections'));
const ClassCollection = lazy(() => import('./pages/ClassCollection'));
const Promotions = lazy(() => import('./pages/Promotions'));
const NewsFeed = lazy(() => import('./pages/NewsFeed'));
const Settings = lazy(() => import('./pages/Settings'));
const Users = lazy(() => import('./pages/Users'));
const Inbox = lazy(() => import('./pages/Inbox'));
const EditStudentProfile = lazy(() => import('./pages/EditStudentProfile'));
const PageLoader = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', width: '100%' }}>
    <div className="animate-spin" style={{ width: '40px', height: '40px', border: '3px solid #6366f1', borderTopColor: 'transparent', borderRadius: '50%' }} />
  </div>
);

function App() {
  const [user, setUser] = useState(() => {
    try {
      const manualSession = localStorage.getItem('manual_session');
      return manualSession ? JSON.parse(manualSession) : null;
    } catch (e) {
      console.error("Session parse error", e);
      localStorage.removeItem('manual_session');
      return null;
    }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log("App mounted");
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      console.log("Auth State Changed", currentUser);
      if (!currentUser) {
        // Check if there's a manual bypass session
        try {
          const manualSession = localStorage.getItem('manual_session');
          if (manualSession) {
            setUser(JSON.parse(manualSession));
          } else {
            setUser(null);
          }
        } catch (e) {
          console.error("Session check error", e);
          localStorage.removeItem('manual_session');
          setUser(null);
        }
      } else {
        setUser(currentUser);
      }
      setLoading(false);
    }, (error) => {
      console.error("Auth Error", error);
      alert("Auth Error: " + error.message);
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
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={!user ? <Login /> : <Navigate to="/" />} />

        <Route path="/" element={user ? <MainLayout /> : <Navigate to="/login" />}>
          <Route index element={<Dashboard />} />
          <Route path="admission" element={<Admission />} />
          <Route path="classes" element={<Classes />} />
          <Route path="classes/:classId" element={<ClassDetails />} />
          <Route path="student/edit/:classId/:studentId" element={<EditStudentProfile />} />
          <Route path="teachers" element={<Teachers />} />
          <Route path="parents" element={<Parents />} />
          <Route path="collections" element={<Collections />} />
          <Route path="collections/:classId" element={<ClassCollection />} />
          <Route path="promotions" element={<Promotions />} />
          <Route path="news-feed" element={<NewsFeed />} />
          <Route path="inbox" element={<Inbox />} />
          <Route path="settings" element={<Settings />} />
          <Route path="users" element={<Users />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

export default App;
