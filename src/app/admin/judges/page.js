'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { doc, setDoc, getDocs, getDoc, collection, deleteDoc, updateDoc, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { createUserWithEmailAndPassword, getAuth, fetchSignInMethodsForEmail, signOut, deleteUser } from 'firebase/auth';

export default function JudgeManagement() {
  const [judges, setJudges] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [showActionsMenu, setShowActionsMenu] = useState(null);
  const [activeDropdown, setActiveDropdown] = useState(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, right: 0 });
  const [showEventModal, setShowEventModal] = useState(false);
  const [selectedJudge, setSelectedJudge] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [emailWarning, setEmailWarning] = useState(''); // Track duplicate email warning
  const router = useRouter();
  const auth = getAuth();
  const emailCheckTimeoutRef = useRef(null); // For debouncing email checks

  // Form state for adding new judge
  const [newJudge, setNewJudge] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
    assignedEvents: []
  });

  useEffect(() => {
    loadJudges();
    loadEvents();
    
    // Track current user to preserve admin session
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setCurrentUser(user);
      
      // If user is not authenticated or not admin, redirect to admin login
      if (!user) {
        router.push('/admin/login');
      }
    });
    
    return () => unsubscribe();
  }, []);

  const loadJudges = async () => {
    try {
      const judgesCollection = collection(db, 'judges');
      const judgesSnapshot = await getDocs(judgesCollection);
      const judgesList = judgesSnapshot.docs.map(doc => ({
        id: doc.id,
        uid: doc.id,
        ...doc.data()
      }));
      // Filter out managescore@gmail.com from the list
      const filteredJudges = judgesList.filter(judge => judge.email !== 'managescore@gmail.com');
      setJudges(filteredJudges);
    } catch (error) {
      console.error('Error loading judges:', error);
      setError('Failed to load judges');
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (activeDropdown && !event.target.closest('.dropdown-menu')) {
        closeDropdown();
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [activeDropdown]);

  const toggleDropdown = (judgeId, event) => {
    if (activeDropdown === judgeId) {
      setActiveDropdown(null);
    } else {
      const rect = event.target.getBoundingClientRect();
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
      
      setDropdownPosition({
        top: rect.bottom + scrollTop + 4,
        right: window.innerWidth - rect.right - scrollLeft + 4
      });
      setActiveDropdown(judgeId);
    }
  };

  const closeDropdown = () => {
    setActiveDropdown(null);
  };

  // Function to check if judge is already assigned to any event
  const isJudgeAssignedToAnyEvent = (judgeId) => {
    const judge = judges.find(j => j.id === judgeId);
    return judge && judge.assignedEvents && judge.assignedEvents.length > 0;
  };

  // Function to check if judge is assigned to a specific event
  const isJudgeAssignedToEvent = (judgeId, eventId) => {
    const judge = judges.find(j => j.id === judgeId);
    return judge && judge.assignedEvents && judge.assignedEvents.includes(eventId);
  };

  // Function to get judge's current assigned event
  const getJudgeAssignedEvent = (judgeId) => {
    const judge = judges.find(j => j.id === judgeId);
    if (!judge || !judge.assignedEvents || judge.assignedEvents.length === 0) {
      return null;
    }
    const eventId = judge.assignedEvents[0];
    return events.find(e => e.id === eventId);
  };

  // Function to check for duplicate email with debouncing
  const checkEmailDuplicate = async (email) => {
    if (!email || !email.includes('@')) {
      setEmailWarning('');
      return false;
    }

    // Clear any existing timeout
    if (emailCheckTimeoutRef.current) {
      clearTimeout(emailCheckTimeoutRef.current);
    }

    // Set a new timeout for debounced checking
    emailCheckTimeoutRef.current = setTimeout(async () => {
      try {
        setEmailWarning('🔍 Checking email availability...');

        // Check if email exists in Firestore
        const judgesCollection = collection(db, 'judges');
        const q = query(judgesCollection, where('email', '==', email));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
          setEmailWarning('⚠️ This email is already registered as a judge. Please use a different email address.');
          return true;
        }

        // Check if email exists in Firebase Authentication
        try {
          const signInMethods = await fetchSignInMethodsForEmail(auth, email);
          if (signInMethods.length > 0) {
            setEmailWarning('⚠️ This email is already registered in the system. Please use a different email address.');
            return true;
          }
        } catch (e) {
          // Continue if auth check fails - the createUserWithEmailAndPassword will catch actual duplicates
        }

        setEmailWarning('✅ Email is available');
        // Clear the success message after 2 seconds
        setTimeout(() => setEmailWarning(''), 2000);
        return false;
      } catch (error) {
        console.error('Error checking email:', error);
        setEmailWarning('');
        return false;
      }
    }, 500); // 500ms debounce

    return false;
  };

  const loadEvents = async () => {
    try {
      // Load events from Firestore
      const eventsCollection = collection(db, 'events');
      const eventsSnapshot = await getDocs(eventsCollection);
      const eventsList = eventsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setEvents(eventsList);
    } catch (error) {
      console.error('Error loading events:', error);
      setEvents([]);
    }
  };

  // Function to close add judge form and reset state
  const closeAddForm = () => {
    setShowAddForm(false);
    setEmailWarning('');
    setError('');

    // Clear any pending email check timeout
    if (emailCheckTimeoutRef.current) {
      clearTimeout(emailCheckTimeoutRef.current);
      emailCheckTimeoutRef.current = null;
    }
  };

  const handleAddJudge = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    // Store current admin user to preserve session
    const adminUser = auth.currentUser;

    // Set flag to prevent admin layout from redirecting during judge creation
    if (typeof window !== 'undefined') {
      window.creatingJudge = true;
    }

    try {
      // Validate form
      if (!newJudge.name || !newJudge.email || !newJudge.password) {
        setError('Name, email, and password are required');
        setLoading(false);
        return;
      }

      // Check if email already exists in Firestore
      const judgesCollection = collection(db, 'judges');
      const q = query(judgesCollection, where('email', '==', newJudge.email));
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        setError('This email address is already registered as a judge. Please use a different email.');
        setLoading(false);
        return;
      }

      // Check if email already exists in Firebase Authentication
      try {
        const signInMethods = await fetchSignInMethodsForEmail(auth, newJudge.email);
        if (signInMethods.length > 0) {
          setError('This email address is already registered in Firebase Authentication. Please use a different email.');
          setLoading(false);
          return;
        }
      } catch (authCheckError) {
        // If the auth check fails, proceed - the createUserWithEmailAndPassword will catch actual duplicates
        console.warn('Auth check warning:', authCheckError);
      }

      // Create Firebase Auth user
      let userCredential;
      try {
        userCredential = await createUserWithEmailAndPassword(
          auth,
          newJudge.email,
          newJudge.password
        );
      } catch (authError) {
        if (authError.code === 'auth/email-already-in-use') {
          setError('This email address is already registered. Please use a different email or reset the password if this is an existing judge.');
          setLoading(false);
          return;
        }
        throw authError; // Re-throw other auth errors to be handled below
      }
      
      const user = userCredential.user;

      // Create judge document in Firestore
      const judgeData = {
        uid: user.uid,
        name: newJudge.name,
        email: newJudge.email,
        phone: newJudge.phone || '',
        assignedEvents: newJudge.assignedEvents,
        isActive: true,
        createdAt: new Date().toISOString(),
        role: 'judge'
      };

      await setDoc(doc(db, 'judges', user.uid), judgeData);

      // Reset form
      setNewJudge({
        name: '',
        email: '',
        password: '',
        phone: '',
        assignedEvents: []
      });
      closeAddForm();
      setSuccess('Judge added successfully!');
      
      // Reload judges list
      await loadJudges();

    } catch (error) {
      console.error('Error adding judge:', error);
      console.error('Error code:', error.code);
      console.error('Error message:', error.message);
      
      // Handle specific Firebase Auth errors
      if (error.code === 'auth/email-already-in-use') {
        setError('This email address is already registered in Firebase Authentication. Please use a different email or check if this user is already in the system.');
      } else if (error.code === 'auth/weak-password') {
        setError('Password should be at least 6 characters long.');
      } else if (error.code === 'auth/invalid-email') {
        setError('Please enter a valid email address.');
      } else if (error.code === 'auth/operation-not-allowed') {
        setError('Email/password accounts are not enabled. Please contact administrator.');
      } else if (error.code === 'auth/network-request-failed') {
        setError('Network error. Please check your internet connection and try again.');
      } else if (error.code === 'auth/too-many-requests') {
        setError('Too many failed attempts. Please try again later or reset the password.');
      } else {
        setError('Failed to add judge: ' + (error.message || 'Unknown error occurred'));
      }
    } finally {
      // Clear the creating judge flag
      if (typeof window !== 'undefined') {
        window.creatingJudge = false;
      }
      setLoading(false);
    }
  };

  const handleDeleteJudge = async (judgeId) => {
    if (!confirm('Are you sure you want to delete this judge? This action cannot be undone.\n\nNote: This will remove the judge from the system and delete their authentication account.')) {
      return;
    }

    try {
      // First, get the judge data to check if they have an auth account
      const judgeRef = doc(db, 'judges', judgeId);
      const judgeDoc = await getDoc(judgeRef);
      const judgeData = judgeDoc.data();
      
      // Attempt to delete the Firebase Authentication account via API
      let authDeleted = false;
      let authError = null;
      let manualInstructions = null;
      
      try {
        const response = await fetch('/api/admin/delete-judge-auth', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ uid: judgeId }),
        });

        // Check if response is JSON
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const result = await response.json();
          
          if (result.success) {
            authDeleted = true;
            console.log('Auth account deleted successfully');
          } else {
            authError = result.error || 'Unknown error occurred';
            console.error('Auth deletion failed:', result);
            
            // If manual instructions are provided, store them
            if (result.instructions) {
              manualInstructions = result.instructions;
              authError = `${result.error}. Manual deletion required - see instructions.`;
            }
            
            // If it's a configuration error, provide more helpful message
            if (result.details?.includes('Firebase Admin SDK not configured')) {
              authError = 'Firebase Admin SDK not configured on server. Manual deletion required.';
            }
          }
        } else {
          // Handle non-JSON response (likely HTML error page)
          const text = await response.text();
          console.error('Non-JSON response:', text.substring(0, 200));
          authError = 'Server returned non-JSON response. Check server logs for Firebase Admin SDK configuration errors.';
        }
      } catch (apiError) {
        authError = apiError.message;
        console.error('API call failed:', apiError);
      }
      
      // Delete the judge document from Firestore
      await deleteDoc(judgeRef);
      
      // Clean up any event assignments for this judge
      const eventsCollection = collection(db, 'events');
      const eventsSnapshot = await getDocs(eventsCollection);
      
      const batchUpdates = [];
      eventsSnapshot.forEach((eventDoc) => {
        const eventData = eventDoc.data();
        if (eventData.assignedJudges && eventData.assignedJudges.includes(judgeId)) {
          const updatedAssignedJudges = eventData.assignedJudges.filter(id => id !== judgeId);
          batchUpdates.push(
            updateDoc(eventDoc.ref, { assignedJudges: updatedAssignedJudges })
          );
        }
      });
      
      if (batchUpdates.length > 0) {
        await Promise.all(batchUpdates);
        console.log(`Cleaned up judge assignments from ${batchUpdates.length} events`);
      }
      
      // Show appropriate success message
      if (authDeleted) {
        setSuccess('Judge and their authentication account deleted successfully');
      } else if (authError && manualInstructions) {
        // Show detailed manual instructions
        const instructionText = Object.values(manualInstructions).join('\n');
        setSuccess(`Judge deleted from system. Manual auth deletion required:\n\n${instructionText}\n\nJudge UID: ${judgeId}`);
      } else if (authError) {
        setSuccess(`Judge deleted from system. Note: ${authError}. The auth account may need manual deletion.`);
      } else {
        setSuccess('Judge deleted successfully');
      }
      
      await loadJudges();
    } catch (error) {
      console.error('Error deleting judge:', error);
      setError('Failed to delete judge: ' + error.message);
    }
  };

  const handleToggleJudgeStatus = async (judgeId, currentStatus) => {
    try {
      const judgeRef = doc(db, 'judges', judgeId);
      await updateDoc(judgeRef, {
        isActive: !currentStatus
      });
      setSuccess(`Judge ${!currentStatus ? 'activated' : 'deactivated'} successfully`);
      await loadJudges();
    } catch (error) {
      console.error('Error updating judge status:', error);
      setError('Failed to update judge status');
    }
  };

  const handleEventAssignment = async (judgeId, eventId, isChecked) => {
    try {
      const judgeRef = doc(db, 'judges', judgeId);
      const judge = judges.find(j => j.id === judgeId);
      const currentAssignedEvents = judge.assignedEvents || [];
      
      // Prevent assignment to multiple events
      if (isChecked && currentAssignedEvents.length > 0) {
        // Judge is already assigned to an event, prevent new assignment
        const existingEvent = getJudgeAssignedEvent(judgeId);
        setError(`Judge is already assigned to "${existingEvent?.eventName || 'an event'}". A judge can only be assigned to one event at a time.`);
        return;
      }
      
      let updatedAssignedEvents;
      if (isChecked) {
        updatedAssignedEvents = [eventId]; // Only allow one event
      } else {
        updatedAssignedEvents = []; // Remove all assignments
      }

      await updateDoc(judgeRef, {
        assignedEvents: updatedAssignedEvents
      });

      setSuccess('Event assignments updated successfully');
      await loadJudges();
    } catch (error) {
      console.error('Error updating event assignments:', error);
      setError('Failed to update event assignments');
    }
  };

  const getStatusColor = (isActive) => {
    return isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
  };

  return (
    <div className="p-6">
      {/* Page Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Judge Management</h1>
          <p className="text-gray-600">Add, manage, and assign judges to events</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-2 bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors shadow-lg"
          >
            <span className="text-xl">+</span>
            Add New Judge
          </button>
        </div>
      </div>

      {/* Success/Error Messages */}
      {success && (
        <div className="mb-6 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
          <div className="flex items-center gap-2">
            <span className="text-lg">✅</span>
            <span>{success}</span>
            <button
              onClick={() => setSuccess('')}
              className="ml-auto text-green-500 hover:text-green-700"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          <div className="flex items-center gap-2">
            <span className="text-lg">⚠️</span>
            <span>{error}</span>
            <button
              onClick={() => setError('')}
              className="ml-auto text-red-500 hover:text-red-700"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Add Judge Form */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-8 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Add New Judge</h2>
              <button
                onClick={closeAddForm}
                className="text-gray-400 hover:text-gray-600 p-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <form onSubmit={handleAddJudge} className="space-y-6">
              {/* Email Warning Banner */}
              {emailWarning.includes('⚠️') && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <span className="text-red-500 text-xl flex-shrink-0">🚫</span>
                    <div>
                      <h4 className="text-sm font-semibold text-red-800 mb-1">Duplicate Email Address</h4>
                      <p className="text-sm text-red-700">{emailWarning.replace('⚠️ ', '')}</p>
                      <p className="text-xs text-red-600 mt-2">Please use a different email address to continue.</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Personal Information Section */}
              <div className="bg-gray-50 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <span className="text-green-600">👤</span>
                  Personal Information
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Full Name *
                    </label>
                    <input
                      type="text"
                      value={newJudge.name}
                      onChange={(e) => setNewJudge({...newJudge, name: e.target.value})}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-600 focus:border-transparent transition-all"
                      placeholder="Enter judge's full name"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Email Address *
                    </label>
                    <div className="relative">
                      <input
                        type="email"
                        value={newJudge.email}
                        onChange={(e) => {
                          setNewJudge({...newJudge, email: e.target.value});
                          checkEmailDuplicate(e.target.value);
                        }}
                        className={`w-full px-4 py-3 pr-10 border rounded-lg focus:ring-2 focus:border-transparent transition-all ${
                          emailWarning.includes('⚠️')
                            ? 'border-red-400 focus:ring-red-500 bg-red-50'
                            : emailWarning.includes('✅')
                            ? 'border-green-400 focus:ring-green-500 bg-green-50'
                            : emailWarning.includes('🔍')
                            ? 'border-blue-400 focus:ring-blue-500 bg-blue-50'
                            : 'border-gray-300 focus:ring-blue-500'
                        }`}
                        placeholder="judge@example.com"
                        required
                      />
                      {/* Status Icon */}
                      <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                        {emailWarning.includes('🔍') && (
                          <svg className="animate-spin h-5 w-5 text-blue-500" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                          </svg>
                        )}
                        {emailWarning.includes('✅') && (
                          <svg className="h-5 w-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                        {emailWarning.includes('⚠️') && (
                          <svg className="h-5 w-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                          </svg>
                        )}
                      </div>
                    </div>
                    {emailWarning && (
                      <p className={`text-sm mt-2 flex items-center gap-2 ${
                        emailWarning.includes('⚠️') ? 'text-red-600' :
                        emailWarning.includes('✅') ? 'text-green-600' :
                        emailWarning.includes('🔍') ? 'text-blue-600' : 'text-gray-600'
                      }`}>
                        {emailWarning}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Phone Number
                    </label>
                    <input
                      type="tel"
                      value={newJudge.phone}
                      onChange={(e) => setNewJudge({...newJudge, phone: e.target.value})}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-600 focus:border-transparent transition-all"
                      placeholder="+1234567890"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Password *
                    </label>
                    <input
                      type="password"
                      value={newJudge.password}
                      onChange={(e) => setNewJudge({...newJudge, password: e.target.value})}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-600 focus:border-transparent transition-all"
                      placeholder="Min 6 characters"
                      required
                      minLength="6"
                    />
                  </div>
                </div>
              </div>

              {/* Form Actions */}
              <div className="flex gap-4 pt-4 border-t border-gray-200">
                <button
                  type="submit"
                  disabled={loading || !!emailWarning}
                  className="flex-1 bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                      </svg>
                      Adding Judge...
                    </span>
                  ) : (
                    'Add Judge'
                  )}
                </button>
                <button
                  type="button"
                  onClick={closeAddForm}
                  className="flex-1 bg-gray-200 text-gray-700 px-6 py-3 rounded-lg hover:bg-gray-300 transition-colors font-medium"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Judges Table */}
      <div className="bg-white rounded-xl shadow-md overflow-hidden">
        <div className="bg-green-600 px-4 sm:px-6 py-3 sm:py-4">
          <h3 className="text-base sm:text-lg font-semibold text-white">All Judges</h3>
          <p className="text-green-100 text-xs sm:text-sm">Manage judge accounts and assignments</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Judge Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phone</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Assigned Events</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {judges.map((judge) => (
                <tr key={judge.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-gray-900">{judge.name}</div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">{judge.email}</td>
                  <td className="px-6 py-4 text-sm text-gray-900">{judge.phone || '-'}</td>
                  <td className="px-6 py-4">
                    <div className="max-w-xs">
                      {(judge.assignedEvents || []).length > 0 ? (
                        <div className="space-y-1">
                          {(judge.assignedEvents || []).map(eventId => {
                            const event = events.find(e => e.id === eventId);
                            return event ? (
                              <div key={eventId} className="flex items-center gap-2">
                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                  🏆 {event.eventName}
                                </span>
                                <span className="text-xs text-gray-500">(Assigned)</span>
                              </div>
                            ) : null;
                          })}
                          <div className="text-xs text-green-600 italic">
                            ✓ Single event assignment
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <span className="text-gray-400 text-xs">No events assigned</span>
                          <div className="text-xs text-gray-500">
                            Available for assignment
                          </div>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(judge.isActive)}`}>
                      <span>{judge.isActive ? '✅' : '❌'}</span>
                      {judge.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="relative dropdown-menu">
                      <button
                        onClick={(e) => toggleDropdown(judge.id, e)}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all duration-200"
                        title="More actions"
                      >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                        </svg>
                      </button>

                      {/* Dropdown Menu */}
                      {activeDropdown === judge.id && (
                        <div 
                          className="fixed w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-[9999]"
                          style={{
                            top: `${dropdownPosition.top}px`,
                            right: `${dropdownPosition.right}px`
                          }}
                        >
                          <button
                            onClick={() => {
                              setSelectedJudge(judge);
                              closeDropdown();
                              setShowEventModal(true);
                            }}
                            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                          >
                            <span className="text-green-600">✏️</span>
                            Assign Events
                          </button>
                          <button
                            onClick={() => {
                              handleToggleJudgeStatus(judge.id, judge.isActive);
                              closeDropdown();
                            }}
                            className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 ${
                              judge.isActive 
                                ? 'text-orange-600 hover:bg-orange-50' 
                                : 'text-green-600 hover:bg-green-50'
                            }`}
                          >
                            <span>{judge.isActive ? '⏸️' : '▶️'}</span>
                            {judge.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                          <hr className="my-1 border-gray-200" />
                          <button
                            onClick={() => {
                              if (confirm('Are you sure you want to delete this judge? This action cannot be undone.')) {
                                handleDeleteJudge(judge.id);
                                closeDropdown();
                              }
                            }}
                            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                          >
                            <span>🗑️</span>
                            Delete Judge
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Empty State */}
      {judges.length === 0 && (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">🧑‍⚖️</div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No judges added yet</h3>
          <p className="text-gray-500">Click "Add New Judge" to create your first judge account</p>
        </div>
      )}

      {/* Event Assignment Modal */}
      {showEventModal && selectedJudge && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-bold text-gray-900 mb-4">
              Assign Events for {selectedJudge.name}
            </h3>
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {events.map(event => {
                const isAssigned = (selectedJudge.assignedEvents || []).includes(event.id);
                const hasOtherAssignment = (selectedJudge.assignedEvents || []).length > 0 && !isAssigned;
                const currentAssignment = (selectedJudge.assignedEvents || [])[0];
                const currentEvent = currentAssignment ? events.find(e => e.id === currentAssignment) : null;
                
                return (
                  <label 
                    key={event.id} 
                    className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                      hasOtherAssignment 
                        ? 'border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed' 
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isAssigned}
                      disabled={hasOtherAssignment}
                      onChange={(e) => {
                        if (hasOtherAssignment) return; // Prevent selection if already assigned to another event
                        
                        const updatedJudge = {
                          ...selectedJudge,
                          assignedEvents: e.target.checked ? [event.id] : []
                        };
                        setSelectedJudge(updatedJudge);
                      }}
                      className={`rounded border-gray-300 text-green-600 focus:ring-green-500 w-4 h-4 ${
                        hasOtherAssignment ? 'cursor-not-allowed opacity-50' : ''
                      }`}
                    />
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">{event.eventName}</div>
                      <div className="text-sm text-gray-500">{event.date} at {event.time}</div>
                      <div className="text-xs text-gray-400">{event.venue}</div>
                      {hasOtherAssignment && (
                        <div className="text-xs text-orange-600 mt-1">
                          Already assigned to "{currentEvent?.eventName || 'another event'}"
                        </div>
                      )}
                    </div>
                    {isAssigned && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/admin/events/${event.id}/judges`);
                          setShowEventModal(false);
                        }}
                        className="text-green-600 hover:text-green-800 text-sm font-medium"
                      >
                        Manage →
                      </button>
                    )}
                  </label>
                );
              })}
            </div>
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 mt-4">
              <div className="flex items-start gap-2">
                <span className="text-green-600 text-sm">ℹ️</span>
                <div className="text-sm text-green-800">
                  <strong>Important:</strong> A judge can only be assigned to one event at a time. 
                  Selecting a new event will automatically remove any existing assignments.
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={async () => {
                  try {
                    // Update the judge's assigned events in Firestore
                    const judgeRef = doc(db, 'judges', selectedJudge.id);
                    await updateDoc(judgeRef, {
                      assignedEvents: selectedJudge.assignedEvents || []
                    });
                    setSuccess('Event assignments updated successfully');
                    setShowEventModal(false);
                    setSelectedJudge(null);
                    await loadJudges();
                  } catch (error) {
                    console.error('Error updating event assignments:', error);
                    setError('Failed to update event assignments');
                  }
                }}
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
              >
                Save Changes
              </button>
              <button
                onClick={() => {
                  setShowEventModal(false);
                  setSelectedJudge(null);
                }}
                className="bg-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-400 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
