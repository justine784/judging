'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { doc, setDoc, getDocs, collection, deleteDoc, updateDoc, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { createUserWithEmailAndPassword, getAuth, fetchSignInMethodsForEmail, signOut } from 'firebase/auth';

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
  const router = useRouter();
  const auth = getAuth();

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
      setJudges(judgesList);
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

      // Check if email already exists in Firebase Authentication
      const signInMethods = await fetchSignInMethodsForEmail(auth, newJudge.email);
      if (signInMethods.length > 0) {
        setError('This email address is already registered in Firebase Authentication. Please use a different email.');
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

      // Create Firebase Auth user
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        newJudge.email,
        newJudge.password
      );
      
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
      setShowAddForm(false);
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
    if (!confirm('Are you sure you want to delete this judge? This action cannot be undone.')) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'judges', judgeId));
      setSuccess('Judge deleted successfully');
      await loadJudges();
    } catch (error) {
      console.error('Error deleting judge:', error);
      setError('Failed to delete judge');
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
      
      let updatedAssignedEvents;
      if (isChecked) {
        updatedAssignedEvents = [...currentAssignedEvents, eventId];
      } else {
        updatedAssignedEvents = currentAssignedEvents.filter(id => id !== eventId);
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
            className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors shadow-lg"
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
                onClick={() => setShowAddForm(false)}
                className="text-gray-400 hover:text-gray-600 p-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <form onSubmit={handleAddJudge} className="space-y-6">
              {/* Personal Information Section */}
              <div className="bg-gray-50 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <span className="text-blue-600">👤</span>
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
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      placeholder="Enter judge's full name"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Email Address *
                    </label>
                    <input
                      type="email"
                      value={newJudge.email}
                      onChange={(e) => setNewJudge({...newJudge, email: e.target.value})}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      placeholder="judge@example.com"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Phone Number
                    </label>
                    <input
                      type="tel"
                      value={newJudge.phone}
                      onChange={(e) => setNewJudge({...newJudge, phone: e.target.value})}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
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
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
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
                  disabled={loading}
                  className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
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
                  onClick={() => setShowAddForm(false)}
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
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-4">
          <h3 className="text-lg font-semibold text-white">All Judges</h3>
          <p className="text-blue-100 text-sm">Manage judge accounts and assignments</p>
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
                        <div className="flex flex-wrap gap-1">
                          {(judge.assignedEvents || []).map(eventId => {
                            const event = events.find(e => e.id === eventId);
                            return event ? (
                              <span key={eventId} className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                {event.eventName}
                              </span>
                            ) : null;
                          })}
                        </div>
                      ) : (
                        <span className="text-gray-400 text-xs">No events assigned</span>
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
                            <span className="text-blue-600">✏️</span>
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
              {events.map(event => (
                <label key={event.id} className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={(selectedJudge.assignedEvents || []).includes(event.id)}
                    onChange={(e) => {
                      const updatedJudge = {
                        ...selectedJudge,
                        assignedEvents: e.target.checked
                          ? [...(selectedJudge.assignedEvents || []), event.id]
                          : (selectedJudge.assignedEvents || []).filter(id => id !== event.id)
                      };
                      setSelectedJudge(updatedJudge);
                    }}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">{event.eventName}</div>
                    <div className="text-sm text-gray-500">{event.date} at {event.time}</div>
                    <div className="text-xs text-gray-400">{event.venue}</div>
                  </div>
                  {(selectedJudge.assignedEvents || []).includes(event.id) && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/admin/events/${event.id}/judges`);
                        setShowEventModal(false);
                      }}
                      className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                    >
                      Manage →
                    </button>
                  )}
                </label>
              ))}
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
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
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
