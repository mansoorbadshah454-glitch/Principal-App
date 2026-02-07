import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';

import MainLayout from './layouts/MainLayout';
// import MainLayout from './layouts/MainLayout';
// const MainLayout = () => {
//   return (
//     <div style={{ padding: 20, border: '5px solid red' }}>
//       <h1>Main Layout (Mock)</h1>
//       <Outlet />
//     </div>
//   );
// };
import { Outlet } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Classes from './pages/Classes';
import Teachers from './pages/Teachers';
import Parents from './pages/Parents';
import ClassDetails from './pages/ClassDetails';
import Admission from './pages/Admission';
import Login from './pages/Login';
import Collections from './pages/Collections';
import ClassCollection from './pages/ClassCollection';
import Promotions from './pages/Promotions';
import NewsFeed from './pages/NewsFeed';
import Settings from './pages/Settings';

// Dummy Components to prevent crash
// const Dashboard = () => <h1>Dashboard (Mock)</h1>;
// const Classes = () => <h1>Classes (Mock)</h1>;
// const Teachers = () => <h1>Teachers (Mock)</h1>;
// const Parents = () => <h1>Parents (Mock)</h1>;
// const ClassDetails = () => <h1>ClassDetails (Mock)</h1>;
// const Admission = () => <h1>Admission (Mock)</h1>;
// const Login = () => <h1>Login (Mock)</h1>;
// const Collections = () => <h1>Collections (Mock)</h1>;
// const ClassCollection = () => <h1>ClassCollection (Mock)</h1>;
// const Promotions = () => <h1>Promotions (Mock)</h1>;
// const NewsFeed = () => <h1>NewsFeed (Mock)</h1>;
// const Settings = () => <h1>Settings (Mock)</h1>;

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
    <Routes>
      <Route path="/login" element={!user ? <Login /> : <Navigate to="/" />} />

      <Route path="/" element={user ? <MainLayout /> : <Navigate to="/login" />}>
        <Route index element={<Dashboard />} />
        <Route path="admission" element={<Admission />} />
        <Route path="classes" element={<Classes />} />
        <Route path="classes/:classId" element={<ClassDetails />} />
        <Route path="teachers" element={<Teachers />} />
        <Route path="parents" element={<Parents />} />
        <Route path="collections" element={<Collections />} />
        <Route path="collections/:classId" element={<ClassCollection />} />
        <Route path="promotions" element={<Promotions />} />
        <Route path="news-feed" element={<NewsFeed />} />
        <Route path="settings" element={<Settings />} />
        <Route path="users" element={<div className="card"><h2>User Admin Page</h2></div>} />
      </Route>
    </Routes>
  );
}

export default App;
