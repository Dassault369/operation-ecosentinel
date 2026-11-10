import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, collection, query, onSnapshot, addDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { 
  MapPin, Clock, CheckCircle, Package, Truck, User, 
  Plus, HeartHandshake, Navigation, AlertTriangle, ShieldCheck,
  Sparkles, Loader2, Image as ImageIcon,
  Lock, Mail, LogOut, ArrowRight, Info, Route, Phone
} from 'lucide-react';

const firebaseConfig = {
  apiKey: "AIzaSyBhTlegRpMFLqQSfYZRPCG-2HNWp69c9CY",
  authDomain: "ecosentinal-666a8.firebaseapp.com",
  projectId: "ecosentinal-666a8",
  storageBucket: "ecosentinal-666a8.firebasestorage.app",
  messagingSenderId: "693609900667",
  appId: "1:693609900667:web:1e36abcb11f7a5b29710de"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

const formatTime = (date) => {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
};

const calculateConsumptionWindow = (bestHours, maxHours) => {
  const bHours = parseFloat(bestHours) || 2;
  const mHours = parseFloat(maxHours) || 4;
  const now = new Date();
  const best = new Date(now.getTime() + bHours * 60 * 60 * 1000);
  const max = new Date(now.getTime() + mHours * 60 * 60 * 1000);
  
  return {
    bestWindow: `${formatTime(now)} to ${formatTime(best)}`,
    safeUntil: formatTime(max),
    discardAfter: formatTime(max)
  };
};

export default function EcoSentinelApp() {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [authUser, setAuthUser] = useState({ 
    name: '', email: '', password: '', role: 'donor', phone: '', location: '' 
  });
  const [currentUserInfo, setCurrentUserInfo] = useState(null);
  const [authError, setAuthError] = useState('');
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  const [activeRole, setActiveRole] = useState('donor');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [activeNavigationId, setActiveNavigationId] = useState(null);
  const [listings, setListings] = useState([]);
  
  const [newFood, setNewFood] = useState({ 
    foodType: '', quantity: '', bestBeforeHours: 2, maxSafeHours: 4, 
    imagePreview: null, location: '', phone: '' 
  });
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        setIsAuthenticated(false);
        setCurrentUserInfo(null);
        setIsLoadingAuth(false);
        return;
      }

      try {
        const profileSnap = await getDoc(doc(db, 'userProfiles', currentUser.uid));
        if (profileSnap.exists()) {
          const profile = profileSnap.data();
          setCurrentUserInfo(profile);
          setActiveRole(profile.role);
          setIsAuthenticated(true);
        }
      } catch (error) {
        console.error('Error loading profile:', error);
      } finally {
        setIsLoadingAuth(false);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const listingsRef = collection(db, 'publicListings');
    const q = query(listingsRef);
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedListings = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setListings(fetchedListings.sort((a, b) => {
        const aTime = a.createdAt?.toMillis?.() ?? 0;
        const bTime = b.createdAt?.toMillis?.() ?? 0;
        return bTime - aTime;
      }));
    }, (error) => {
      console.error("Error fetching listings:", error);
    });

    return () => unsubscribe();
  }, [user]);

  const analyzeFoodImage = async (base64Image) => {
    setIsAnalyzing(true);
    try {
      const payload = {
          contents: [
              {
                  role: "user",
                  parts: [
                      { text: "Analyze this image of surplus food being donated. Identify the likely food type. Then, critically estimate the safe consumption windows for donation purposes. Return a JSON object with strictly three keys: 'foodType' (a short descriptive string), 'bestBeforeHours' (number), and 'maxSafeHours' (number)." },
                      {
                          inlineData: {
                              mimeType: "image/jpeg",
                              data: base64Image
                          }
                      }
                  ]
              }
          ],
          generationConfig: {
              responseMimeType: "application/json",
          }
      };
      
      const apiKey = "";
      
      if (!apiKey || apiKey === "") {
        console.warn("API Key is missing. AI Analysis will not work.");
        setIsAnalyzing(false);
        return;
      }

      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;
      
      const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
      });
      const result = await response.json();
      
      if (result.candidates && result.candidates.length > 0) {
          const jsonStr = result.candidates[0].content.parts[0].text;
          const parsedData = JSON.parse(jsonStr);
          
          setNewFood(prev => ({
              ...prev,
              foodType: parsedData.foodType || prev.foodType,
              bestBeforeHours: parsedData.bestBeforeHours || prev.bestBeforeHours,
              maxSafeHours: parsedData.maxSafeHours || prev.maxSafeHours
          }));
      }
    } catch (error) {
        console.error("Gemini AI error analyzing image:", error);
    } finally {
        setIsAnalyzing(false);
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    try {
      setIsAnalyzing(true);
      const previewUrl = URL.createObjectURL(file);
      setNewFood(prev => ({ ...prev, imagePreview: previewUrl }));

      const storageRef = ref(storage, `food-images/${user.uid}/${Date.now()}-${file.name}`);
      await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(storageRef);
      setNewFood(prev => ({ ...prev, imagePreview: downloadUrl }));

      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || '');
        const base64String = result.includes(',') ? result.split(',')[1] : result;
        analyzeFoodImage(base64String);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Image upload error:', error);
      setAuthError('Could not upload the image. Please try again.');
      setIsAnalyzing(false);
    }
  };

  const handleAddListing = async (e) => {
    e.preventDefault();
    if (!newFood.foodType || !newFood.quantity || !user || !currentUserInfo) return;
    
    const { bestWindow, discardAfter } = calculateConsumptionWindow(newFood.bestBeforeHours, newFood.maxSafeHours);

    const listingData = {
      donorName: currentUserInfo.name,
      donorId: user.uid,
      donorPhone: newFood.phone || currentUserInfo.phone,
      foodType: newFood.foodType,
      quantity: newFood.quantity,
      bestWindow: bestWindow,
      discardAfter: discardAfter,
      status: 'AVAILABLE',
      location: newFood.location || currentUserInfo.location,
      ngoName: null,
      ngoId: null,
      ngoPhone: null,
      volunteerName: null,
      volunteerId: null,
      image: newFood.imagePreview || 'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?auto=format&fit=crop&w=500&q=80',
      createdAt: serverTimestamp()
    };
    
    try {
      const listingsRef = collection(db, 'publicListings');
      await addDoc(listingsRef, listingData);
      setNewFood({ 
        foodType: '', quantity: '', bestBeforeHours: 2, maxSafeHours: 4, 
        imagePreview: null, location: currentUserInfo.location, phone: currentUserInfo.phone 
      });
      setShowAddModal(false);
    } catch (error) {
      console.error("Error adding listing:", error);
    }
  };

  const handleClaimFood = async (id) => {
    if (!user || currentUserInfo?.role !== 'ngo') return;
    try {
      const listingRef = doc(db, 'publicListings', id);
      await updateDoc(listingRef, {
        status: 'CLAIMED',
        ngoName: currentUserInfo.name,
        ngoId: user.uid,
        ngoPhone: currentUserInfo.phone
      });
    } catch (error) {
      console.error("Error claiming food:", error);
    }
  };

  const handleAcceptMission = async (id) => {
    if (!user || currentUserInfo?.role !== 'volunteer') return;
    try {
      const listingRef = doc(db, 'publicListings', id);
      await updateDoc(listingRef, {
        status: 'IN_TRANSIT',
        volunteerName: currentUserInfo.name,
        volunteerId: user.uid
      });
      setActiveNavigationId(id);
    } catch (error) {
      console.error("Error accepting mission:", error);
    }
  };

  const handleCompleteDelivery = async (id) => {
    if (!user || currentUserInfo?.role !== 'volunteer') return;
    try {
      const listingRef = doc(db, 'publicListings', id);
      await updateDoc(listingRef, {
        status: 'DELIVERED'
      });
      setActiveNavigationId(null);
    } catch (error) {
      console.error("Error completing delivery:", error);
    }
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    const email = authUser.email.trim().toLowerCase();

    try {
      if (authMode === 'signup') {
        if (!authUser.name.trim()) { setAuthError('Name is required'); return; }
        if (!authUser.password || authUser.password.length < 6) {
          setAuthError('Password must be at least 6 characters.');
          return;
        }

        const credential = await createUserWithEmailAndPassword(auth, email, authUser.password);
        const userInfo = {
          name: authUser.name.trim(),
          email,
          role: authUser.role,
          phone: authUser.phone.trim(),
          location: authUser.location.trim(),
          uid: credential.user.uid
        };

        await setDoc(doc(db, 'userProfiles', credential.user.uid), userInfo);
        setCurrentUserInfo(userInfo);
        setActiveRole(userInfo.role);
        setIsAuthenticated(true);
      } else {
        const credential = await signInWithEmailAndPassword(auth, email, authUser.password);
        const profileSnap = await getDoc(doc(db, 'userProfiles', credential.user.uid));

        if (!profileSnap.exists()) {
          await signOut(auth);
          setAuthError('Profile not found. Please contact the administrator.');
          return;
        }

        const existingData = profileSnap.data();
        setCurrentUserInfo(existingData);
        setActiveRole(existingData.role);
        setIsAuthenticated(true);
      }
    } catch (error) {
      console.error('Authentication error:', error);
      const messages = {
        'auth/email-already-in-use': 'This email is already registered.',
        'auth/invalid-email': 'Please enter a valid email address.',
        'auth/weak-password': 'Password must be at least 6 characters.',
        'auth/invalid-credential': 'Invalid email or password.',
        'auth/user-not-found': 'No account found with this email.',
        'auth/wrong-password': 'Invalid email or password.'
      };
      setAuthError(messages[error.code] || 'Authentication failed. Please try again.');
    }
  };

  const renderAuthScreen = () => (
    <div className="min-h-screen bg-[url('https://images.unsplash.com/photo-1593113565214-80afcb4a4571?auto=format&fit=crop&w=1920&q=80')] bg-cover bg-center flex items-center justify-center p-4 relative">
      <div className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm"></div>
      <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-md relative z-10 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-center mb-6">
           <div className="bg-emerald-600 p-3.5 rounded-2xl shadow-lg shadow-emerald-200/50">
             <HeartHandshake className="text-white" size={32} />
           </div>
        </div>
        
        <h2 className="text-2xl font-bold text-center text-gray-800 mb-2">
           {authMode === 'login' ? 'Welcome Back' : 'Join Operation EcoSentinel'}
        </h2>
        <p className="text-center text-gray-500 mb-6 text-sm">
           {authMode === 'login' ? 'Log in to manage your food rescue missions' : 'Create an account to help reduce urban food waste'}
        </p>

        {authError && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-start gap-2 text-sm">
            <AlertTriangle size={18} className="shrink-0 mt-0.5" />
            <p>{authError}</p>
          </div>
        )}

        <form onSubmit={handleAuthSubmit} className="space-y-4">
          {authMode === 'signup' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Select Your Role First</label>
              <div className="grid grid-cols-3 gap-2">
                {['donor', 'ngo', 'volunteer'].map(role => (
                  <div 
                    key={role}
                    onClick={() => setAuthUser({...authUser, role})}
                    className={`cursor-pointer text-center py-2.5 rounded-lg border text-sm font-medium capitalize transition-all ${
                      authUser.role === role ? 'bg-emerald-50 border-emerald-500 text-emerald-700 ring-1 ring-emerald-500' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {role}
                  </div>
                ))}
              </div>
            </div>
          )}

          {authMode === 'signup' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {authUser.role === 'ngo' ? 'Organization Name' : 'Full Name'}
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input 
                  type="text" required
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none bg-gray-50/50"
                  placeholder={authUser.role === 'ngo' ? "e.g. Hope Foundation" : "e.g. John Doe"}
                  value={authUser.name} onChange={e => setAuthUser({...authUser, name: e.target.value})}
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input 
                type="email" required
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none bg-gray-50/50"
                placeholder="hello@example.com"
                value={authUser.email} onChange={e => setAuthUser({...authUser, email: e.target.value})}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input 
                type="password" required
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none bg-gray-50/50"
                placeholder="••••••••"
                value={authUser.password} onChange={e => setAuthUser({...authUser, password: e.target.value})}
              />
            </div>
          </div>

           {authMode === 'signup' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {authUser.role === 'ngo' ? 'Orphanage / NGO Location' : 'Default Location'}
                </label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input 
                    type="text" required
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none bg-gray-50/50"
                    placeholder="e.g. Downtown, Main Street"
                    value={authUser.location} onChange={e => setAuthUser({...authUser, location: e.target.value})}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contact Phone Number</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input 
                    type="tel" required
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none bg-gray-50/50"
                    placeholder="e.g. +91 9876543210"
                    value={authUser.phone} onChange={e => setAuthUser({...authUser, phone: e.target.value})}
                  />
                </div>
              </div>
            </>
          )}

          <button 
            type="submit"
            disabled={isLoadingAuth}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-xl font-semibold transition-all shadow-lg shadow-emerald-200 flex justify-center items-center gap-2 mt-4 disabled:opacity-70"
          >
            {isLoadingAuth ? <Loader2 className="animate-spin" /> : (authMode === 'login' ? 'Sign In to Portal' : 'Create Account')} 
            {!isLoadingAuth && <ArrowRight size={18} />}
          </button>
        </form>

        <div className="mt-8 text-center text-sm text-gray-600 border-t border-gray-100 pt-6">
          {authMode === 'login' ? (
            <p>New to EcoSentinel? <button onClick={() => {setAuthMode('signup'); setAuthError('');}} className="text-emerald-600 font-bold hover:underline">Sign up here</button></p>
          ) : (
            <p>Already have an account? <button onClick={() => {setAuthMode('login'); setAuthError('');}} className="text-emerald-600 font-bold hover:underline">Log in</button></p>
          )}
        </div>
      </div>
    </div>
  );

  const StatusBadge = ({ status }) => {
    const styles = {
      AVAILABLE: 'bg-green-100 text-green-800 border-green-200',
      CLAIMED: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      IN_TRANSIT: 'bg-blue-100 text-blue-800 border-blue-200',
      DELIVERED: 'bg-gray-100 text-gray-800 border-gray-200',
    };
    return (
      <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${styles[status] || styles.AVAILABLE}`}>
        {status?.replace('_', ' ')}
      </span>
    );
  };

  const renderDonorView = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">My Food Listings</h2>
          <p className="text-gray-500 text-sm mt-1">Manage your surplus food donations</p>
        </div>
        <button
          onClick={() => {
            setNewFood(prev => ({...prev, location: currentUserInfo?.location || '', phone: currentUserInfo?.phone || ''}));
            setShowAddModal(true);
          }}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-lg flex items-center gap-2 font-medium transition-colors shadow-sm"
        >
          <Plus size={20} /> List Surplus Food
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {listings.filter(l => l.donorId === user?.uid).map(listing => (
          <div key={listing.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex flex-col">
            {listing.image && (
              <div className="w-full h-40 mb-4 rounded-lg overflow-hidden bg-gray-100 relative group">
                <img src={listing.image} alt={listing.foodType} className="w-full h-full object-cover" />
              </div>
            )}
            <div className="flex justify-between items-start mb-4">
              <StatusBadge status={listing.status} />
            </div>
            
            <h3 className="text-xl font-bold text-gray-800 mb-2">{listing.foodType}</h3>
            
            <div className="flex flex-col gap-1.5 bg-slate-50 px-3 py-2.5 rounded-lg border border-slate-200 w-full mb-4">
              <div className="flex items-center text-emerald-700 text-sm font-medium">
                <Clock size={16} className="mr-1.5" /> 
                <span>Best time: {listing.bestWindow}</span>
              </div>
              <div className="flex items-center text-yellow-600 text-sm font-medium mt-0.5">
                <Info size={16} className="mr-1.5" /> 
                <span>Safe until: {listing.discardAfter}</span>
              </div>
              <div className="flex items-center text-red-600 text-sm font-bold mt-1 pt-1 border-t border-slate-200">
                <AlertTriangle size={16} className="mr-1.5" /> 
                <span>DO NOT USE AFTER: {listing.discardAfter}</span>
              </div>
            </div>

            <div className="space-y-2 mb-6 flex-grow">
              <p className="text-gray-600 flex items-center gap-2 text-sm">
                <Package size={16} className="text-gray-400" /> {listing.quantity}
              </p>
              <p className="text-gray-600 flex items-center gap-2 text-sm">
                <MapPin size={16} className="text-gray-400" /> {listing.location}
              </p>
              <p className="text-gray-600 flex items-center gap-2 text-sm">
                <Phone size={16} className="text-gray-400" /> {listing.donorPhone}
              </p>
            </div>
            {listing.status === 'CLAIMED' && (
              <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 text-sm text-blue-800 flex flex-col gap-1">
                <div className="flex items-start gap-2">
                  <ShieldCheck size={18} className="shrink-0 mt-0.5" />
                  <span>Claimed by <strong>{listing.ngoName}</strong>. Waiting for volunteer.</span>
                </div>
              </div>
            )}
             {listing.status === 'IN_TRANSIT' && (
              <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-100 text-sm text-emerald-800 flex items-start gap-2">
                <Truck size={18} className="shrink-0 mt-0.5" />
                <span>Picked up by <strong>{listing.volunteerName}</strong>. En route.</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  const renderNgoView = () => (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <h2 className="text-2xl font-bold text-gray-800">Available Rescues Near You</h2>
        <p className="text-gray-500 text-sm mt-1">Claim food before the safety window expires</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-100 rounded-xl overflow-hidden relative min-h-[400px] border border-gray-200">
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
             <MapPin size={48} className="text-emerald-500 animate-bounce drop-shadow-lg" />
             <div className="bg-white px-4 py-2 rounded-full shadow-lg font-bold text-gray-800 text-sm mt-2">
               Scanning local radius...
             </div>
          </div>
        </div>

        <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 pb-4">
          {listings.filter(l => l.status === 'AVAILABLE' || l.ngoId === user?.uid).map(listing => (
            <div key={listing.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:border-emerald-200 transition-colors flex flex-col">
              {listing.image && (
                <div className="w-full h-36 mb-3 rounded-lg overflow-hidden bg-gray-100 relative group">
                  <img src={listing.image} alt={listing.foodType} className="w-full h-full object-cover" />
                </div>
              )}
              <div className="flex justify-between items-start mb-2">
                <h3 className="text-lg font-bold text-gray-800">{listing.foodType}</h3>
                <StatusBadge status={listing.status} />
              </div>
              <p className="text-sm font-medium text-gray-700 mb-2">From: {listing.donorName}</p>
              
              <div className="space-y-2 mb-4">
                <p className="text-gray-600 flex items-center gap-2 text-sm">
                  <Package size={14} className="text-gray-400" /> Quantity: {listing.quantity}
                </p>
                <p className="text-gray-600 flex items-center gap-2 text-sm">
                  <MapPin size={14} className="text-gray-400" /> Location: {listing.location}
                </p>
                <p className="text-gray-600 flex items-center gap-2 text-sm">
                  <Phone size={14} className="text-gray-400" /> Phone: {listing.donorPhone}
                </p>
              </div>
              
              {listing.status === 'AVAILABLE' ? (
                <button 
                  onClick={() => handleClaimFood(listing.id)}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-lg font-medium transition-colors mt-auto"
                >
                  Claim Food Now
                </button>
              ) : (
                <div className="w-full bg-gray-100 text-gray-600 py-2.5 rounded-lg font-medium text-center flex justify-center items-center gap-2 mt-auto">
                  <CheckCircle size={18} /> Claimed Successfully
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderVolunteerView = () => {
    const activeMission = listings.find(l => l.id === activeNavigationId);

    if (activeMission) {
      return (
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex justify-between items-center">
            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
              <Navigation className="text-blue-600" /> Live Navigation Route
            </h2>
            <StatusBadge status={activeMission.status} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-slate-100 rounded-xl overflow-hidden relative min-h-[400px] border border-gray-200">
               <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
               <div className="absolute inset-0 flex items-center justify-center p-8">
                  <div className="relative w-full max-w-md h-full flex flex-col items-center justify-center">
                      
                      <div className="absolute top-10 left-10 flex flex-col items-center">
                         <div className="bg-emerald-100 p-3 rounded-full border-2 border-emerald-500 shadow-lg relative z-10">
                           <Package size={24} className="text-emerald-700" />
                         </div>
                         <div className="bg-white px-3 py-1 rounded shadow text-xs font-bold mt-2">Pickup: {activeMission.donorName}</div>
                      </div>

                      <div className="absolute bottom-10 right-10 flex flex-col items-center">
                         <div className="bg-blue-100 p-3 rounded-full border-2 border-blue-500 shadow-lg relative z-10">
                           <HeartHandshake size={24} className="text-blue-700" />
                         </div>
                         <div className="bg-white px-3 py-1 rounded shadow text-xs font-bold mt-2">Drop: {activeMission.ngoName}</div>
                      </div>

                      <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{zIndex: 0}}>
                        <path 
                          d="M 80,80 Q 200,200 350,300" 
                          fill="transparent" 
                          stroke="#3b82f6" 
                          strokeWidth="4" 
                          strokeDasharray="10, 10" 
                          className="animate-[dash_2s_linear_infinite]"
                        />
                      </svg>
                      
                      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white p-2 rounded-full shadow-xl border border-gray-200 animate-pulse z-20">
                         <Truck size={28} className="text-blue-600" />
                      </div>
                      
                      <style dangerouslySetInnerHTML={{__html: `
                        @keyframes dash {
                          to {
                            stroke-dashoffset: -20;
                          }
                        }
                      `}} />
                  </div>
               </div>
            </div>

            <div className="space-y-4">
               <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                  <h3 className="font-bold text-gray-800 text-lg mb-4 border-b pb-2">Mission Details</h3>
                  
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">Food Item</p>
                      <p className="font-medium text-gray-800 flex items-center gap-2"><Package size={16} className="text-emerald-600"/> {activeMission.foodType} ({activeMission.quantity})</p>
                    </div>
                    
                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                      <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">Pick up from</p>
                      <p className="font-medium text-gray-800 mb-1">{activeMission.donorName}</p>
                      <p className="text-sm text-gray-600 flex items-center gap-1.5"><MapPin size={14}/> {activeMission.location}</p>
                      <p className="text-sm text-gray-600 flex items-center gap-1.5"><Phone size={14}/> {activeMission.donorPhone}</p>
                    </div>

                    <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                      <p className="text-xs text-blue-500 uppercase tracking-wider font-semibold mb-1">Deliver to</p>
                      <p className="font-medium text-blue-900 mb-1">{activeMission.ngoName}</p>
                      <p className="text-sm text-blue-800 flex items-center gap-1.5"><Phone size={14}/> {activeMission.ngoPhone}</p>
                    </div>
                  </div>
               </div>

               <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                  <button
                    onClick={() => handleCompleteDelivery(activeMission.id)}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-4 rounded-xl font-bold transition-all shadow-lg flex justify-center items-center gap-2 text-lg"
                  >
                    <CheckCircle size={22} /> Complete Delivery
                  </button>
               </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-2xl font-bold text-gray-800">Active Rescue Missions</h2>
          <p className="text-gray-500 text-sm mt-1">Accept missions to transport food to NGOs</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {listings.filter(l => l.status === 'CLAIMED').map(listing => (
            <div key={listing.id} className="bg-white rounded-xl shadow-sm border p-6 hover:border-blue-200 transition-colors">
              <div className="flex justify-between items-start mb-2">
                 <h3 className="text-xl font-bold text-gray-800 mb-2">{listing.foodType}</h3>
                 <StatusBadge status={listing.status} />
              </div>
              <p className="text-sm text-gray-600 flex items-center gap-1.5 mb-1"><MapPin size={16} className="text-gray-400"/> Pickup: {listing.location}</p>
              <p className="text-sm text-gray-600 flex items-center gap-1.5 mb-4"><HeartHandshake size={16} className="text-gray-400"/> Drop: {listing.ngoName}</p>
              
              <button 
                onClick={() => handleAcceptMission(listing.id)}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold mt-2 flex justify-center items-center gap-2 shadow-sm"
              >
                <Route size={18} /> Accept Mission & Start Routing
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <>
      {!isAuthenticated ? (
        renderAuthScreen()
      ) : (
        <div className="min-h-screen bg-slate-50 font-sans text-gray-900">
          <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex justify-between h-16 items-center">
                <div className="flex items-center gap-2">
                  <div className="bg-emerald-600 p-2 rounded-lg shadow-sm">
                    <HeartHandshake className="text-white" size={24} />
                  </div>
                  <span className="text-xl font-bold text-emerald-700 hidden sm:block">
                    Operation EcoSentinel
                  </span>
                </div>

                <div className="flex bg-emerald-50 px-4 py-1.5 rounded-full border border-emerald-100">
                  <span className="text-sm font-bold text-emerald-800 capitalize flex items-center gap-2">
                    <ShieldCheck size={16}/> {currentUserInfo?.role} Portal
                  </span>
                </div>

                <div className="flex items-center gap-4">
                  <button 
                    onClick={() => {
                      setIsAuthenticated(false);
                      setAuthUser({...authUser, password: ''});
                      setActiveNavigationId(null);
                    }}
                    className="text-gray-500 hover:text-red-600 transition-colors flex items-center gap-1 text-sm font-medium bg-gray-100 px-3 py-1.5 rounded-lg border"
                  >
                    <LogOut size={16}/> <span>Logout</span>
                  </button>
                </div>
              </div>
            </div>
          </header>

          <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {activeRole === 'donor' && renderDonorView()}
            {activeRole === 'ngo' && renderNgoView()}
            {activeRole === 'volunteer' && renderVolunteerView()}
          </main>

          {showAddModal && (
            <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden max-h-[90vh] flex flex-col">
                <div className="bg-emerald-600 px-6 py-4 flex justify-between items-center shrink-0">
                  <h3 className="text-lg font-bold text-white">List Surplus Food</h3>
                  <button onClick={() => setShowAddModal(false)} className="text-emerald-100 hover:text-white">✕</button>
                </div>
                <div className="p-6 overflow-y-auto flex-1">
                  <form onSubmit={handleAddListing} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Upload Food Image</label>
                      <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-lg relative overflow-hidden group bg-gray-50">
                        {newFood.imagePreview ? (
                           <div className="absolute inset-0 w-full h-full">
                             <img src={newFood.imagePreview} alt="Preview" className="w-full h-full object-cover" />
                           </div>
                        ) : (
                          <div className="space-y-1 text-center">
                            <ImageIcon className="mx-auto h-12 w-12 text-gray-400" />
                            <p className="text-xs text-gray-500">Upload a photo</p>
                            <p className="text-xs text-emerald-600 font-medium">Let Gemini AI fill the details!</p>
                          </div>
                        )}
                        <input 
                          type="file" 
                          accept="image/*"
                          onChange={handleImageUpload}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                      </div>

                      {isAnalyzing && (
                        <div className="mt-3 flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 p-2.5 rounded-lg border border-emerald-100 shadow-sm animate-pulse">
                          <Loader2 size={16} className="animate-spin text-emerald-600" />
                          <span>Gemini AI is analyzing image and predicting expiry...</span>
                        </div>
                      )}
                      {!isAnalyzing && newFood.imagePreview && newFood.foodType && (
                         <div className="mt-3 flex items-start gap-2 text-sm text-blue-700 bg-blue-50 p-2.5 rounded-lg border border-blue-100 shadow-sm">
                          <Sparkles size={16} className="text-blue-600 shrink-0 mt-0.5" />
                          <span>AI auto-filled the food details and estimated safety window below. Please review.</span>
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Food Category / Description</label>
                      <input 
                        type="text" required
                        className="w-full px-4 py-2 rounded-lg border border-gray-300 outline-none"
                        value={newFood.foodType}
                        onChange={(e) => setNewFood({...newFood, foodType: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                      <input 
                        type="text" required
                        className="w-full px-4 py-2 rounded-lg border border-gray-300 outline-none"
                        value={newFood.quantity}
                        onChange={(e) => setNewFood({...newFood, quantity: e.target.value})}
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-gray-100 pt-4 mt-2">
                       <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Pickup Location</label>
                        <input 
                          type="text" required
                          className="w-full px-4 py-2 rounded-lg border border-gray-300 outline-none"
                          value={newFood.location}
                          onChange={(e) => setNewFood({...newFood, location: e.target.value})}
                        />
                      </div>
                       <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Contact Phone</label>
                        <input 
                          type="tel" required
                          className="w-full px-4 py-2 rounded-lg border border-gray-300 outline-none"
                          value={newFood.phone}
                          onChange={(e) => setNewFood({...newFood, phone: e.target.value})}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 border-t border-gray-100 pt-4 mt-2">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Best Before (Hours)</label>
                        <input 
                          type="number" required min="1"
                          className="w-full px-4 py-2 rounded-lg border border-gray-300 outline-none"
                          value={newFood.bestBeforeHours}
                          onChange={(e) => setNewFood({...newFood, bestBeforeHours: e.target.value})}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Max Safe Limit (Hours)</label>
                        <input 
                          type="number" required min={newFood.bestBeforeHours}
                          className="w-full px-4 py-2 rounded-lg border border-gray-300 outline-none"
                          value={newFood.maxSafeHours}
                          onChange={(e) => setNewFood({...newFood, maxSafeHours: e.target.value})}
                        />
                      </div>
                    </div>

                    {(newFood.bestBeforeHours || newFood.maxSafeHours) && (
                      <div className="mt-2 flex flex-col gap-2 text-sm bg-slate-50 p-3 rounded-lg border border-slate-200">
                        <div className="flex items-center gap-2 text-emerald-800">
                          <Clock size={16} className="text-emerald-600 shrink-0" />
                          <span><strong>Best time to consume:</strong> {calculateConsumptionWindow(newFood.bestBeforeHours, newFood.maxSafeHours)?.bestWindow}</span>
                        </div>
                        <div className="flex items-center gap-2 text-yellow-700">
                          <Info size={16} className="text-yellow-600 shrink-0" />
                          <span><strong>Safe to consume until:</strong> {calculateConsumptionWindow(newFood.bestBeforeHours, newFood.maxSafeHours)?.safeUntil}</span>
                        </div>
                        <div className="flex items-center gap-2 text-red-700 pt-2 border-t border-slate-200">
                          <AlertTriangle size={16} className="text-red-600 shrink-0" />
                          <span><strong>DO NOT USE AFTER:</strong> {calculateConsumptionWindow(newFood.bestBeforeHours, newFood.maxSafeHours)?.discardAfter}</span>
                        </div>
                      </div>
                    )}

                    <div className="pt-4 flex gap-3">
                      <button type="button" onClick={() => setShowAddModal(false)} className="flex-1 px-4 py-2 border rounded-lg">Cancel</button>
                      <button type="submit" className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg">Post</button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}