import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Explore from './pages/Explore';
import Profile from './pages/Profile';
import Onboarding from './pages/Onboarding';
import UserProfile from './pages/UserProfile';
import Community from './pages/Community';
import CommunityDetail from './pages/CommunityDetail';
import PostDetail from './pages/PostDetail';
import Projects from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
import MyFriends from './pages/MyFriends';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />

          {/* Protected Application Routes */}
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<Navigate to="/explore" replace />} />
            <Route path="/explore" element={<Explore />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/users/:id" element={<UserProfile />} />
            <Route path="/community" element={<Community />} />
            <Route path="/community/:communityId" element={<CommunityDetail />} />
            <Route path="/community/:communityId/posts/:postId" element={<PostDetail />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/projects/:projectId" element={<ProjectDetail />} />
            <Route path="/friends" element={<MyFriends />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/explore" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
