import { useState, useEffect } from 'react';
import Login from './components/Login';
import Chat from './components/Chat';

function App() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);

  useEffect(() => {
    // Check if user is logged in from localStorage
    const savedToken = localStorage.getItem('chat_token');
    const savedUser = localStorage.getItem('chat_user');
    
    if (savedToken && savedUser) {
      setToken(savedToken);
      setUser(JSON.parse(savedUser));
    }
  }, []);

  const handleLogin = (userData, authToken) => {
    setUser(userData);
    setToken(authToken);
    localStorage.setItem('chat_token', authToken);
    localStorage.setItem('chat_user', JSON.stringify(userData));
  };

  const handleLogout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('chat_token');
    localStorage.removeItem('chat_user');
  };

  return (
    <div className="app-container">
      {!user || !token ? (
        <Login onLogin={handleLogin} />
      ) : (
        <Chat user={user} token={token} onLogout={handleLogout} />
      )}
    </div>
  );
}

export default App;
