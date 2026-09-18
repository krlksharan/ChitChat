import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { 
  LogOut, ArrowUp, Plus, Paperclip, Mic, Headphones, Trash2, PhoneOff, Check, X,
  Search, PanelLeftClose, Edit, Image as ImageIcon, 
  PlusCircle, Settings, HelpCircle, Edit3, Gift, ChevronDown, Menu, UserPlus, Users
} from 'lucide-react';

const ChatGPTLogo = () => (
  <svg role="img" width="18" height="18" viewBox="0 0 24 24" style={{ color: 'inherit' }}>
    <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.073zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.8956zm16.0993 3.8558L12.5973 8.3829l2.0343-1.1732a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.3879-.6765zM8.504 5.2223a4.4802 4.4802 0 0 1 2.8953 1.0503l-.1419.0804-4.783 2.7582a.7948.7948 0 0 0-.3927.6813V16.53a.071.071 0 0 1-.038-.052V10.895a4.504 4.504 0 0 1 2.4603-4.1221l-.0001-.5506zm8.8164 3.125a4.4708 4.4708 0 0 1 .5346 3.0137l-.142-.0852-4.783-2.7582a.7712.7712 0 0 0-.7806 0L6.29 11.8861V9.5537a.0804.0804 0 0 1 .0332-.0615l4.3423-2.505a4.4992 4.4992 0 0 1 6.1408 1.6464zM12 15.3323a3.3323 3.3323 0 1 1 0-6.6646 3.3323 3.3323 0 0 1 0 6.6646z" fill="currentColor"/>
  </svg>
);

export default function Chat({ user, token, onLogout }) {
  const [socket, setSocket] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [activeContact, setActiveContact] = useState(null);
  const [addContactUsername, setAddContactUsername] = useState('');
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [typingUsers, setTypingUsers] = useState(new Set());
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  
  // Voice Recording State
  const [isRecording, setIsRecording] = useState(false);
  
  // Video Calling State
  const [isCalling, setIsCalling] = useState(false);
  const [incomingCall, setIncomingCall] = useState(null);

  // Message Actions State
  const [hoveredMessageId, setHoveredMessageId] = useState(null);
  
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const fileInputRef = useRef(null);
  
  // Voice & Video Refs
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);

  // WebRTC Configuration
  const rtcConfig = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
  };

  // Fetch Contacts
  const fetchContacts = async () => {
    try {
      const response = await fetch('/api/contacts', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setContacts(data);
      }
    } catch (err) {
      console.error('Failed to fetch contacts:', err);
    }
  };

  useEffect(() => {
    fetchContacts();
  }, [token]);

  // Fetch messages for active contact
  useEffect(() => {
    const fetchMessages = async () => {
      if (!activeContact) {
        setMessages([]);
        return;
      }
      try {
        const response = await fetch(`/api/messages/${activeContact.id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          const data = await response.json();
          setMessages(data);
        }
      } catch (err) {
        console.error('Failed to fetch messages:', err);
      }
    };
    fetchMessages();
  }, [activeContact, token]);

  // Socket connection
  useEffect(() => {
    const newSocket = io('/', {
      auth: { token }
    });

    newSocket.on('connect_error', (err) => {
      if (err.message.includes('Authentication error')) onLogout();
    });

    newSocket.on('receive_message', (message) => {
      setMessages((prev) => {
        // Only append if the message belongs to the active chat
        if (activeContact && (message.sender_id === activeContact.id || message.receiver_id === activeContact.id)) {
          return [...prev, message];
        }
        return prev;
      });
    });

    newSocket.on('user_typing', (senderId) => {
      if (activeContact && senderId === activeContact.id) {
        setTypingUsers((prev) => new Set(prev).add(senderId));
      }
    });

    newSocket.on('user_stop_typing', (senderId) => {
      setTypingUsers((prev) => {
        const newSet = new Set(prev);
        newSet.delete(senderId);
        return newSet;
      });
    });

    newSocket.on('messages_cleared', (contactId) => {
      if (activeContact && (contactId === activeContact.id || contactId === user.id)) {
        setMessages([]);
      }
    });

    newSocket.on('message_deleted', (id) => {
      setMessages((prev) => prev.filter(m => m.id !== id));
    });

    // WebRTC Listeners
    newSocket.on('webrtc_offer', async (data) => {
      setIncomingCall(data);
    });

    newSocket.on('webrtc_answer', async (data) => {
      if (peerConnectionRef.current) {
        try {
          await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
        } catch (e) {
          console.error('Error setting remote description:', e);
        }
      }
    });

    newSocket.on('webrtc_ice_candidate', async (data) => {
      if (peerConnectionRef.current) {
        try {
          await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (e) {
          console.error('Error adding received ice candidate', e);
        }
      }
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
      endCall();
    };
  }, [token, activeContact, onLogout, user.id]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [messages, typingUsers]);

  const handleAddContact = async (e) => {
    e.preventDefault();
    if (!addContactUsername.trim()) return;
    try {
      const response = await fetch('/api/contacts/add', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ username: addContactUsername.trim() })
      });
      const data = await response.json();
      if (response.ok) {
        setAddContactUsername('');
        fetchContacts();
        setActiveContact(data.contact);
      } else {
        alert(data.error || 'Failed to add contact');
      }
    } catch (err) {
      console.error(err);
      alert('Error adding contact');
    }
  };

  const handleClearMessages = () => {
    if (!socket || !activeContact) return;
    socket.emit('clear_messages', { contact_id: activeContact.id });
  };

  // Media Upload
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !activeContact) return;

    const formData = new FormData();
    formData.append('media', file);

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });
      if (response.ok) {
        const data = await response.json();
        const fileType = file.type.startsWith('video') ? 'video' : 'image';
        const content = `file:${fileType}:${data.url}`;
        socket.emit('send_message', { content, receiver_id: activeContact.id });
      }
    } catch (err) {
      console.error('Upload failed:', err);
    }
  };

  // WebRTC Setup Helper
  const setupPeerConnection = (receiver_id) => {
    const pc = new RTCPeerConnection(rtcConfig);
    
    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit('webrtc_ice_candidate', { candidate: event.candidate, receiver_id });
      }
    };

    pc.ontrack = (event) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    peerConnectionRef.current = pc;
    return pc;
  };

  // Start Call
  const startCall = async () => {
    if (!activeContact) {
      alert('Please select a contact to call.');
      return;
    }
    try {
      setIsCalling(true);
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      
      // Use timeout to ensure the video ref is mounted
      setTimeout(async () => {
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
        
        const pc = setupPeerConnection(activeContact.id);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        
        socket.emit('webrtc_offer', { offer, receiver_id: activeContact.id });
      }, 100);
    } catch (error) {
      console.error('Error starting call:', error);
      alert('Camera and Microphone permission is required for Voice/Video call. Please allow access in your browser settings.');
      setIsCalling(false);
    }
  };

  // Accept Call
  const acceptCall = async () => {
    try {
      setIsCalling(true);
      const { offer, caller_id } = incomingCall;
      setIncomingCall(null);
      
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      
      setTimeout(async () => {
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
        
        const pc = setupPeerConnection(caller_id);
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        
        socket.emit('webrtc_answer', { answer, receiver_id: caller_id });
      }, 100);
      
    } catch (error) {
      console.error('Error accepting call:', error);
      setIsCalling(false);
      setIncomingCall(null);
    }
  };

  // End Call
  const endCall = () => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    setIsCalling(false);
    setIncomingCall(null);
  };

  // Voice Recording Handlers
  const toggleRecording = async () => {
    if (!activeContact) return;
    
    if (isRecording) {
      if (mediaRecorderRef.current) mediaRecorderRef.current.stop();
      setIsRecording(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream);
        audioChunksRef.current = [];
        
        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunksRef.current.push(e.data);
        };
        
        mediaRecorder.onstop = () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);
          reader.onloadend = () => {
            if (socket) {
              socket.emit('send_message', { content: reader.result, receiver_id: activeContact.id });
            }
          };
          stream.getTracks().forEach(track => track.stop());
        };
        
        mediaRecorderRef.current = mediaRecorder;
        mediaRecorder.start();
        setIsRecording(true);
      } catch (err) {
        console.error('Error accessing microphone:', err);
      }
    }
  };

  const handleTyping = (e) => {
    setInputValue(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
    
    if (socket && activeContact) {
      socket.emit('typing', { receiver_id: activeContact.id });
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => socket.emit('stop_typing', { receiver_id: activeContact.id }), 1000);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(e);
    }
  };

  const sendMessage = (e) => {
    if (e) e.preventDefault();
    if (!inputValue.trim() || !socket || !activeContact) return;
    socket.emit('send_message', { content: inputValue, receiver_id: activeContact.id });
    socket.emit('stop_typing', { receiver_id: activeContact.id });
    setInputValue('');
    
    if (e && e.target && e.target.querySelector) {
       const textarea = e.target.querySelector('textarea');
       if (textarea) textarea.style.height = 'auto';
    }
  };

  const sendPrompt = (text) => {
    if (!socket || !activeContact) return;
    socket.emit('send_message', { content: text, receiver_id: activeContact.id });
  };

  const renderInputForm = () => (
    <div className="chat-input-wrapper" style={{ width: '100%', maxWidth: '800px' }}>
      <form onSubmit={sendMessage} className="chat-input-form">
        <button 
          type="button" 
          onClick={() => fileInputRef.current?.click()}
          style={{ 
            background: 'transparent', border: 'none', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', 
            justifyContent: 'center', cursor: 'pointer', padding: '0 0.25rem 0 0.75rem', margin: '0.5rem 0', opacity: 0.6, transition: 'opacity 0.2s', height: '32px'
          }}
          onMouseOver={(e) => e.currentTarget.style.opacity = '1'}
          onMouseOut={(e) => e.currentTarget.style.opacity = '0.6'}
          title="Attach files"
        >
          <Plus size={20} />
        </button>
        
        <button 
          type="button" 
          onClick={handleClearMessages}
          style={{ 
            background: 'transparent', border: 'none', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', 
            justifyContent: 'center', cursor: 'pointer', padding: '0 0.5rem 0 0.25rem', margin: '0.5rem 0', opacity: 0.6, transition: 'opacity 0.2s', height: '32px'
          }}
          onMouseOver={(e) => e.currentTarget.style.opacity = '1'}
          onMouseOut={(e) => e.currentTarget.style.opacity = '0.6'}
          title="Clear chat"
        >
          <Trash2 size={20} />
        </button>
        
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleFileUpload} 
          style={{ display: 'none' }} 
          accept="image/*,video/*"
        />

        <textarea
          value={inputValue}
          onChange={handleTyping}
          onKeyDown={handleKeyDown}
          placeholder="Message..."
          className="chat-input"
          rows={1}
        />

        <div style={{ display: 'flex', alignItems: 'center', marginRight: '0.5rem' }}>
          <button 
            type="button" 
            onClick={toggleRecording}
            className={`mic-btn ${isRecording ? 'recording' : ''}`}
            style={{
              background: 'transparent', border: 'none', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', 
              justifyContent: 'center', cursor: 'pointer', padding: '0 0.75rem', margin: '0.5rem 0', opacity: isRecording ? 1 : 0.6, transition: 'all 0.2s', height: '32px'
            }}
            title={isRecording ? "Stop Recording" : "Use Microphone"}
          >
            <Mic size={20} />
          </button>
          
          {isRecording && (
            <div className="recording-wave-container" title="Recording in progress...">
              <div className="recording-bar"></div>
              <div className="recording-bar"></div>
              <div className="recording-bar"></div>
              <div className="recording-bar"></div>
            </div>
          )}


          <button 
            type="submit" 
            className="send-btn"
            disabled={!inputValue.trim()}
            style={{ opacity: inputValue.trim() ? 1 : 0.2 }}
          >
            <ArrowUp size={20} />
          </button>
        </div>
      </form>
    </div>
  );

  return (
    <div className="chat-container">
      {/* Voice / Video Call Overlay */}
      {(incomingCall || isCalling) && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.95)', zIndex: 9999, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
             <button onClick={endCall} style={{ background: 'var(--bg-hover)', color: 'white', border: 'none', padding: '0.5rem', borderRadius: '50%', cursor: 'pointer' }}>
               <X size={24} />
             </button>
          </div>
          
          <div className="video-streams" style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            {incomingCall && !isCalling ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3rem' }}>
                <div style={{ color: 'white', fontSize: '1.5rem' }}>Incoming call from {incomingCall.caller_username}...</div>
                <div className="ai-orb">
                  <div className="wave-layer"></div>
                  <div className="wave-layer"></div>
                  <div className="wave-layer"></div>
                </div>
                <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
                  <button onClick={acceptCall} style={{ background: '#22c55e', color: 'white', border: 'none', padding: '1rem', borderRadius: '50%', cursor: 'pointer' }}>
                    <Check size={24} />
                  </button>
                  <button onClick={() => setIncomingCall(null)} style={{ background: '#ef4444', color: 'white', border: 'none', padding: '1rem', borderRadius: '50%', cursor: 'pointer' }}>
                    <PhoneOff size={24} />
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '2rem', flexDirection: 'column' }}>
                {/* Show the beautiful voice orb when in an active call too */}
                <div className="ai-orb" style={{ marginBottom: '2rem' }}>
                  <div className="wave-layer"></div>
                  <div className="wave-layer"></div>
                  <div className="wave-layer"></div>
                </div>
                <div style={{ position: 'relative', display: 'flex', gap: '1rem' }}>
                   <video ref={remoteVideoRef} autoPlay playsInline style={{ maxWidth: '400px', maxHeight: '300px', borderRadius: '1rem', objectFit: 'cover' }} />
                   <video ref={localVideoRef} autoPlay playsInline muted style={{ width: '200px', maxHeight: '150px', borderRadius: '0.5rem', objectFit: 'cover', border: '2px solid #333' }} />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className={`sidebar-overlay ${isSidebarOpen ? 'open' : ''}`} onClick={() => setIsSidebarOpen(false)}></div>
      
      {/* Sidebar - ChatGPT Style */}
      <div className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-top-icons">
          <button className="sidebar-icon-btn" style={{ padding: '0', background: 'transparent' }} title="ChatGPT">
            <ChatGPTLogo />
          </button>
          <div style={{ display: 'flex', gap: '0.25rem' }}>
            <button className="sidebar-icon-btn"><Search size={18} /></button>
            <button className="sidebar-icon-btn" onClick={() => setIsSidebarOpen(false)}><PanelLeftClose size={18} /></button>
          </div>
        </div>
        
        {/* New Chat Button */}
        <div style={{ padding: '0.5rem 0' }}>
          <button className="sidebar-menu-item" onClick={() => { setActiveContact(null); setIsSidebarOpen(false); }}>
            <Edit size={16} />
            <span style={{ fontWeight: 500 }}>New chat</span>
          </button>
        </div>

        {/* Add Contact Form masquerading as a search/input */}
        <form onSubmit={handleAddContact} style={{ padding: '0 0.5rem 1rem 0.5rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input 
              type="text" 
              value={addContactUsername} 
              onChange={(e) => setAddContactUsername(e.target.value)}
              placeholder="Search or add username..."
              style={{ flex: 1, background: 'var(--bg-hover)', border: 'none', color: 'var(--text-primary)', padding: '0.5rem 0.75rem', borderRadius: '8px', fontSize: '0.85rem' }}
            />
            <button type="submit" style={{ background: 'var(--bg-hover)', border: 'none', color: 'var(--text-primary)', padding: '0.5rem', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <UserPlus size={16} />
            </button>
          </div>
        </form>

        {/* Contacts List styled as History */}
        <div className="user-list" style={{ flex: 1, overflowY: 'auto' }}>
          {contacts.length > 0 && <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', padding: '0.5rem 1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Contacts</div>}
          {contacts.map((contact) => (
            <button 
              key={contact.id} 
              className={`sidebar-menu-item ${activeContact?.id === contact.id ? 'active' : ''}`}
              onClick={() => { setActiveContact(contact); setIsSidebarOpen(false); }}
              style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}
            >
              <span style={{ fontWeight: 400, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contact.username}</span>
            </button>
          ))}
          {contacts.length === 0 && (
            <div style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.85rem', paddingLeft: '1rem' }}>
              No chats yet. Add a user above.
            </div>
          )}
        </div>

        <div className="sidebar-footer-links">
          <button className="sidebar-menu-item">
            <PlusCircle size={16} />
            <span>See plans and pricing</span>
          </button>
          <button className="sidebar-menu-item">
            <Settings size={16} />
            <span>Settings</span>
          </button>
          <button className="sidebar-menu-item">
            <HelpCircle size={16} />
            <span>Help</span>
          </button>
          
          <div className="sidebar-promo-box">
            <div className="sidebar-promo-title">Logged in as {user.username}</div>
            <button onClick={onLogout} className="pill-btn primary" style={{ marginTop: '0.5rem' }}>
              <LogOut size={14} style={{ marginRight: '4px' }} /> Log out
            </button>
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="chat-main">
        {/* Top Header */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '1rem', zIndex: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
           <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
             <button onClick={() => setIsSidebarOpen(true)} className="sidebar-icon-btn mobile-menu-btn"><Menu size={20} /></button>
             ChatGPT <ChevronDown size={16} color="var(--text-muted)" />
           </div>
           {activeContact && (
             <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
               <button 
                 type="button"
                 onClick={startCall}
                 className="voice-btn-pill"
                 title="Voice/Video Call"
                 style={{ marginRight: '0.5rem' }}
               >
                 <Headphones size={16} />
                 Voice
               </button>
             </div>
           )}
        </div>

        {!activeContact ? (
          <div className="empty-state-full" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <div className="empty-state-title" style={{ marginBottom: '1rem' }}>Ready when you are.</div>
            
            {renderInputForm()}
            
            <div className="prompts-container">
              <button className="prompt-btn" onClick={() => sendPrompt("Write a WhatsApp message")}>
                <Edit3 size={16} /> Write a WhatsApp message
              </button>
              <button className="prompt-btn" onClick={() => sendPrompt("Gas and bloating remedies")}>
                <Gift size={16} /> Gas and bloating remedies
              </button>
              <button className="prompt-btn" onClick={() => sendPrompt("Help me reply to my boss")}>
                <Edit3 size={16} /> Help me reply to my boss
              </button>
            </div>
            
            <div className="footer-text">
              ChatGPT is AI. By using it, you agree to our <a href="#">Terms</a> & <a href="#">Privacy Policy</a>.<br/>
              Chats may be reviewed and used to improve our AI models. <a href="#">Learn more</a>
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div className="empty-state-full">
            <div className="empty-state-title">Chatting with {activeContact.username}</div>
            
            {renderInputForm()}
            
            <div className="prompts-container">
              <button className="prompt-btn" onClick={() => sendPrompt("Hello!")}>
                <Edit3 size={16} /> Send Hello
              </button>
              <button className="prompt-btn" onClick={() => sendPrompt("How are you?")}>
                <HelpCircle size={16} /> Ask how they are
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="messages-area" style={{ paddingTop: '4rem' }}>
              <div className="messages-container">
                {messages.map((msg) => {
                  const isMine = msg.sender_id === user.id;
                  
                  let messageContent = <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>;
                  
                  if (msg.content.startsWith('data:audio')) {
                    messageContent = <audio controls src={msg.content} className="audio-message" />;
                  } else if (msg.content.startsWith('file:image:')) {
                    const url = msg.content.replace('file:image:', '');
                    messageContent = <img src={url} alt="Uploaded media" style={{ maxWidth: '100%', maxHeight: '400px', borderRadius: '8px' }} />;
                  } else if (msg.content.startsWith('file:video:')) {
                    const url = msg.content.replace('file:video:', '');
                    messageContent = <video controls src={url} style={{ maxWidth: '100%', maxHeight: '400px', borderRadius: '8px' }} />;
                  }

                  return (
                    <div 
                      key={msg.id} 
                      className={`message-row ${isMine ? 'mine' : 'theirs'}`}
                      onMouseEnter={() => setHoveredMessageId(msg.id)}
                      onMouseLeave={() => setHoveredMessageId(null)}
                      style={{ position: 'relative' }}
                    >
                      {!isMine && (
                        <div className="avatar ai" style={{ border: '1px solid var(--border-light)' }}>
                          <ChatGPTLogo />
                        </div>
                      )}
                      <div className="message-content">
                        {!isMine && <div className="message-sender">ChatGPT</div>}
                        {messageContent}
                      </div>
                      {hoveredMessageId === msg.id && (
                        <button 
                          onClick={() => socket && socket.emit('delete_message', msg.id)}
                          style={{
                            background: 'var(--bg-main)', border: '1px solid var(--border-light)', 
                            borderRadius: '6px', padding: '6px', cursor: 'pointer', color: 'var(--text-muted)',
                            position: 'absolute', [isMine ? 'left' : 'right']: '1rem', top: '50%', transform: 'translateY(-50%)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                          }}
                          onMouseOver={(e) => e.currentTarget.style.color = '#ef4444'}
                          onMouseOut={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                          title="Delete message"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  );
                })}
                
                {typingUsers.size > 0 && (
                  <div className="message-row theirs">
                    <div className="avatar ai" style={{ border: '1px solid var(--border-light)' }}>
                       <div style={{ width: '100%', height: '100%', background: '#3b82f6', borderRadius: '50%' }}></div>
                    </div>
                    <div className="message-content" style={{ display: 'flex', alignItems: 'center' }}>
                      <div style={{ display: 'flex', gap: '4px', marginLeft: '10px', marginTop: '5px' }}>
                        <span style={{ width: '6px', height: '6px', background: 'var(--text-muted)', borderRadius: '50%', animation: 'pulse 1.5s infinite ease-in-out' }}></span>
                        <span style={{ width: '6px', height: '6px', background: 'var(--text-muted)', borderRadius: '50%', animation: 'pulse 1.5s infinite ease-in-out 0.2s' }}></span>
                        <span style={{ width: '6px', height: '6px', background: 'var(--text-muted)', borderRadius: '50%', animation: 'pulse 1.5s infinite ease-in-out 0.4s' }}></span>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>
            <div className="chat-input-container">
              {renderInputForm()}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
