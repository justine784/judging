'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { doc, setDoc, getDocs, collection, deleteDoc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export default function EventContestants() {
  const [contestants, setContestants] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingContestant, setEditingContestant] = useState(null);
  const [showRoundModal, setShowRoundModal] = useState(false);
  const [currentRound, setCurrentRound] = useState('preliminary');
  const [event, setEvent] = useState(null);
  const [showActionsDropdown, setShowActionsDropdown] = useState(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, right: 0 });
  const router = useRouter();
  const params = useParams();
  const eventId = params.eventId;

  // Form state
  const [formData, setFormData] = useState({
    contestantNumber: '',
    firstName: '',
    lastName: '',
    age: '',
    address: '',
    contactNumber: ''
  });

  // Load event and contestants data
  useEffect(() => {
    loadEvent();
    loadContestants();
  }, [eventId]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showActionsDropdown && !event.target.closest('.dropdown-menu')) {
        setShowActionsDropdown(null);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showActionsDropdown]);

  const loadEvent = async () => {
    try {
      // Load actual event from Firestore
      const eventDoc = await getDoc(doc(db, 'events', eventId));
      if (eventDoc.exists()) {
        const eventData = {
          id: eventId,
          ...eventDoc.data()
        };
        setEvent(eventData);
        // Set current round from event data or default to preliminary
        setCurrentRound(eventData.currentRound || 'preliminary');
      } else {
        // Fallback to sample data if event not found
        const sampleEvent = {
          id: eventId,
          eventName: eventId === '1' ? 'Grand Vocal Showdown 2026' : eventId === '2' ? 'Battle of the Bands' : 'Acoustic Night 2025',
          eventDescription: 'Annual singing competition featuring the best vocal talents',
          date: '2026-03-15',
          time: '6:00 PM',
          venue: 'University Auditorium',
          status: 'upcoming'
        };
        setEvent(sampleEvent);
      }
    } catch (error) {
      console.error('Error loading event:', error);
      // Fallback to sample data
      const sampleEvent = {
        id: eventId,
        eventName: eventId === '1' ? 'Grand Vocal Showdown 2026' : eventId === '2' ? 'Battle of the Bands' : 'Acoustic Night 2025',
        eventDescription: 'Annual singing competition featuring the best vocal talents',
        date: '2026-03-15',
        time: '6:00 PM',
        venue: 'University Auditorium',
        status: 'upcoming'
      };
      setEvent(sampleEvent);
    }
  };

  const loadContestants = async () => {
    try {
      console.log('Loading contestants from Firestore...');
      const contestantsCollection = collection(db, 'contestants');
      const contestantsSnapshot = await getDocs(contestantsCollection);
      
      const contestantsList = contestantsSnapshot.docs
        .map(doc => {
          const data = doc.data();
          console.log('Found contestant:', data);
          return {
            id: doc.id,
            ...data
          };
        })
        .filter(contestant => 
          contestant.eventId && (contestant.eventId.toString() === eventId.toString() || contestant.eventId === eventId)
        );
      
      console.log('Filtered contestants:', contestantsList);
      setContestants(contestantsList);
    } catch (error) {
      console.error('Error loading contestants:', error);
      // Load sample data as fallback
      const sampleContestants = [
        {
          id: 'sample-1',
          contestantNumber: '001',
          firstName: 'Maria',
          lastName: 'Santos',
          age: '22',
          address: 'Bongabong, Oriental Mindoro',
          contactNumber: '0912-345-6789',
          eventId: eventId,
          status: 'registered'
        },
        {
          id: 'sample-2',
          contestantNumber: '002',
          firstName: 'Juan',
          lastName: 'Dela Cruz',
          age: '24',
          address: 'Bongabong, Oriental Mindoro',
          contactNumber: '0913-456-7890',
          eventId: eventId,
          status: 'registered'
        }
      ];
      setContestants(sampleContestants);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleAddContestant = async () => {
    // Get event details to include eventName
    const eventDetails = await getDoc(doc(db, 'events', eventId));
    const eventName = eventDetails.exists() ? eventDetails.data().eventName : 'Unknown Event';
    
    const newContestant = {
      eventId: eventId,
      eventName: eventName, // Add eventName field
      ...formData,
      status: 'registered'
    };

    try {
      // Save to Firestore
      const contestantRef = doc(collection(db, 'contestants'));
      await setDoc(contestantRef, newContestant);
      
      console.log('Contestant added successfully:', newContestant);
      
      // Update local state with the document ID
      setContestants([...contestants, { ...newContestant, id: contestantRef.id }]);
      setShowAddModal(false);
      resetForm();
      
      // Show success message
      alert(`Contestant "${formData.firstName} ${formData.lastName}" has been added successfully!`);
      
    } catch (error) {
      console.error('Error adding contestant:', error);
    }
  };

  const handleEditContestant = async () => {
    if (!editingContestant) return;

    try {
      // Update in Firestore
      const contestantRef = doc(db, 'contestants', editingContestant.id);
      await updateDoc(contestantRef, {
        contestantNumber: formData.contestantNumber,
        firstName: formData.firstName,
        lastName: formData.lastName,
        age: formData.age,
        address: formData.address,
        contactNumber: formData.contactNumber
      });
      
      console.log('Contestant updated successfully:', editingContestant);
      
      // Update local state
      setContestants(contestants.map(contestant => 
        contestant.id === editingContestant.id 
          ? { ...contestant, ...formData }
          : contestant
      ));
      setShowEditModal(false);
      setEditingContestant(null);
      resetForm();
      
    } catch (error) {
      console.error('Error updating contestant:', error);
    }
  };

  const handleDeleteContestant = async (contestantId) => {
    if (!confirm('Are you sure you want to remove this contestant?')) return;

    try {
      // Delete from Firestore
      await deleteDoc(doc(db, 'contestants', contestantId));
      
      console.log('Contestant deleted successfully:', contestantId);
      
      // Update local state
      setContestants(contestants.filter(contestant => contestant.id !== contestantId));
      
    } catch (error) {
      console.error('Error deleting contestant:', error);
    }
  };

  const openEditModal = (contestant) => {
    setEditingContestant(contestant);
    setFormData({
      contestantNumber: contestant.contestantNumber,
      firstName: contestant.firstName,
      lastName: contestant.lastName,
      age: contestant.age,
      address: contestant.address,
      contactNumber: contestant.contactNumber
    });
    setShowEditModal(true);
  };

  const resetForm = () => {
    setFormData({
      contestantNumber: '',
      firstName: '',
      lastName: '',
      age: '',
      address: '',
      contactNumber: ''
    });
  };

  const getStatusColor = (status) => {
    return status === 'registered' ? 'bg-green-100 text-green-800' : 
           status === 'eliminated' ? 'bg-red-100 text-red-800' :
           status === 'finalist' ? 'bg-blue-100 text-blue-800' :
           'bg-gray-100 text-gray-800';
  };

  const getRoundColor = (round) => {
    return round === 'preliminary' ? 'bg-purple-100 text-purple-800' :
           round === 'semi-final' ? 'bg-orange-100 text-orange-800' :
           round === 'final' ? 'bg-green-100 text-green-800' :
           'bg-gray-100 text-gray-800';
  };

  // Round management functions
  const handleAdvanceRound = async () => {
    try {
      let nextRound;
      if (currentRound === 'preliminary') {
        nextRound = 'semi-final';
        // Eliminate bottom contestants (keep top 10 for example)
        const sortedContestants = [...contestants].sort((a, b) => 
          (b.totalWeightedScore || 0) - (a.totalWeightedScore || 0)
        );
        const contestantsToKeep = sortedContestants.slice(0, 10);
        const contestantsToEliminate = sortedContestants.slice(10);
        
        // Update eliminated contestants
        for (const contestant of contestantsToEliminate) {
          await updateDoc(doc(db, 'contestants', contestant.id), {
            status: 'eliminated',
            eliminatedRound: 'preliminary'
          });
        }
        
        // Update remaining contestants to semi-finalists
        for (const contestant of contestantsToKeep) {
          await updateDoc(doc(db, 'contestants', contestant.id), {
            status: 'finalist'
          });
        }
      } else if (currentRound === 'semi-final') {
        nextRound = 'final';
        // Eliminate bottom contestants (keep top 5 for final)
        const sortedContestants = [...contestants]
          .filter(c => c.status !== 'eliminated')
          .sort((a, b) => (b.totalWeightedScore || 0) - (a.totalWeightedScore || 0));
        const contestantsToKeep = sortedContestants.slice(0, 5);
        const contestantsToEliminate = sortedContestants.slice(5);
        
        // Update eliminated contestants
        for (const contestant of contestantsToEliminate) {
          await updateDoc(doc(db, 'contestants', contestant.id), {
            status: 'eliminated',
            eliminatedRound: 'semi-final'
          });
        }
        
        // Update remaining contestants to finalists
        for (const contestant of contestantsToKeep) {
          await updateDoc(doc(db, 'contestants', contestant.id), {
            status: 'finalist'
          });
        }
      } else {
        // Final round - declare winner
        const sortedContestants = [...contestants]
          .filter(c => c.status !== 'eliminated')
          .sort((a, b) => (b.totalWeightedScore || 0) - (a.totalWeightedScore || 0));
        
        if (sortedContestants.length > 0) {
          const winner = sortedContestants[0];
          await updateDoc(doc(db, 'contestants', winner.id), {
            status: 'winner',
            finalRank: 1
          });
          
          // Update runners-up
          for (let i = 1; i < Math.min(sortedContestants.length, 3); i++) {
            await updateDoc(doc(db, 'contestants', sortedContestants[i].id), {
              status: 'runner-up',
              finalRank: i + 1
            });
          }
        }
        nextRound = 'completed';
      }
      
      // Update event round
      await updateDoc(doc(db, 'events', eventId), {
        currentRound: nextRound
      });
      
      setCurrentRound(nextRound);
      loadContestants(); // Reload contestants to show updated status
      setShowRoundModal(false);
      
      alert(`Successfully advanced to ${nextRound} round!`);
    } catch (error) {
      console.error('Error advancing round:', error);
      alert('Failed to advance round. Please try again.');
    }
  };

  const handleEliminateContestant = async (contestantId) => {
    if (!confirm('Are you sure you want to eliminate this contestant? This action cannot be undone.')) {
      return;
    }
    
    try {
      await updateDoc(doc(db, 'contestants', contestantId), {
        status: 'eliminated',
        eliminatedRound: currentRound
      });
      
      loadContestants();
      alert('Contestant eliminated successfully!');
    } catch (error) {
      console.error('Error eliminating contestant:', error);
      alert('Failed to eliminate contestant. Please try again.');
    }
  };

  const openRoundModal = () => {
    setShowRoundModal(true);
  };

  const handleGoToFinalRounds = async () => {
    try {
      // Update all non-eliminated contestants to finalists
      const contestantsToUpdate = contestants.filter(c => c.status !== 'eliminated');
      
      for (const contestant of contestantsToUpdate) {
        await updateDoc(doc(db, 'contestants', contestant.id), {
          status: 'finalist'
        });
      }
      
      // Update event to final round
      await updateDoc(doc(db, 'events', eventId), {
        currentRound: 'final'
      });
      
      setCurrentRound('final');
      loadContestants();
      alert('Successfully advanced to Final Rounds!');
    } catch (error) {
      console.error('Error going to final rounds:', error);
      alert('Failed to advance to final rounds. Please try again.');
    }
  };

  const toggleDropdown = (contestantId, event) => {
    if (showActionsDropdown === contestantId) {
      setShowActionsDropdown(null);
    } else {
      const rect = event.target.getBoundingClientRect();
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
      
      setDropdownPosition({
        top: rect.bottom + scrollTop + 4,
        right: window.innerWidth - rect.right - scrollLeft + 4
      });
      setShowActionsDropdown(contestantId);
    }
  };

  return (
    <div className="p-6">
      {/* Page Header */}
      <div className="mb-8">
        <div className="flex items-center gap-4 mb-4">
          <button
            onClick={() => router.push('/admin/events')}
            className="text-purple-600 hover:text-purple-700 font-medium flex items-center gap-2"
          >
            <span>←</span>
            Back to Events
          </button>
        </div>
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Contestants Management</h1>
            <p className="text-gray-600">
              Manage contestants for <span className="font-semibold text-purple-600">{event?.eventName}</span>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 bg-purple-600 text-white px-6 py-3 rounded-lg hover:bg-purple-700 transition-colors shadow-lg"
            >
              <span className="text-xl">➕</span>
              Add Contestant
            </button>
            <button
              onClick={openRoundModal}
              className="flex items-center gap-2 bg-orange-600 text-white px-6 py-3 rounded-lg hover:bg-orange-700 transition-colors shadow-lg"
            >
              <span className="text-xl">🏆</span>
              Manage Rounds
            </button>
          </div>
        </div>
      </div>

      {/* Event Info Card */}
      {event && (
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 rounded-xl p-6 mb-8 text-white">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <p className="text-purple-100 text-sm">Date</p>
              <p className="text-lg font-semibold">{event.date}</p>
            </div>
            <div>
              <p className="text-purple-100 text-sm">Time</p>
              <p className="text-lg font-semibold">{event.time}</p>
            </div>
            <div>
              <p className="text-purple-100 text-sm">Venue</p>
              <p className="text-lg font-semibold">{event.venue}</p>
            </div>
            <div>
              <p className="text-purple-100 text-sm">Status</p>
              <p className="text-lg font-semibold">{event.status}</p>
            </div>
            <div>
              <p className="text-purple-100 text-sm">Current Round</p>
              <span className={`inline-flex items-center gap-1 px-3 py-1 text-sm font-bold rounded-full ${getRoundColor(currentRound)}`}>
                🏆 {currentRound.charAt(0).toUpperCase() + currentRound.slice(1)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Contestants Table */}
      <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 px-6 py-4">
          <h3 className="text-lg font-semibold text-white">Registered Contestants</h3>
          <p className="text-purple-100 text-sm">List of all registered contestants for this event</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">No.</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Name</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Age</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Address</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Contact</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {contestants.map((contestant) => (
                <tr key={contestant.id} className="hover:bg-gradient-to-r hover:from-purple-50 hover:to-blue-50 transition-all duration-200">
                  <td className="px-6 py-4">
                    <div className="text-sm font-bold text-purple-600">#{contestant.contestantNumber}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-gray-900">
                      {contestant.firstName} {contestant.lastName}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">{contestant.age}</td>
                  <td className="px-6 py-4 text-sm text-gray-900">{contestant.address}</td>
                  <td className="px-6 py-4 text-sm text-gray-900">{contestant.contactNumber}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(contestant.status)}`}>
                      {contestant.status.charAt(0).toUpperCase() + contestant.status.slice(1)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="relative dropdown-menu">
                      <button
                        onClick={(e) => toggleDropdown(contestant.id, e)}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all duration-200"
                        title="More actions"
                      >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                        </svg>
                      </button>

                      {/* Dropdown Menu */}
                      {showActionsDropdown === contestant.id && (
                        <div 
                          className="fixed w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-[9999]"
                          style={{
                            top: `${dropdownPosition.top}px`,
                            right: `${dropdownPosition.right}px`
                          }}
                        >
                          <button
                            onClick={() => { openEditModal(contestant); setShowActionsDropdown(null); }}
                            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                          >
                            <span className="text-blue-600">✏️</span>
                            Edit Contestant
                          </button>
                          {contestant.status !== 'eliminated' && currentRound !== 'completed' && (
                            <button
                              onClick={() => { handleEliminateContestant(contestant.id); setShowActionsDropdown(null); }}
                              className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                            >
                              <span>❌</span>
                              Eliminate Contestant
                            </button>
                          )}
                          {currentRound !== 'final' && currentRound !== 'completed' && contestant.status !== 'eliminated' && (
                            <button
                              onClick={() => { handleGoToFinalRounds(); setShowActionsDropdown(null); }}
                              className="w-full text-left px-4 py-2 text-sm text-green-600 hover:bg-green-50 flex items-center gap-2"
                            >
                              <span>🏆</span>
                              Go to Final Rounds
                            </button>
                          )}
                          <button
                            onClick={() => { handleDeleteContestant(contestant.id); setShowActionsDropdown(null); }}
                            className="w-full text-left px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 flex items-center gap-2"
                          >
                            <span>🗑️</span>
                            Remove Contestant
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
      {contestants.length === 0 && (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">👥</div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No contestants yet</h3>
          <p className="text-gray-500 mb-4">Add contestants to get started</p>
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700 transition-colors"
          >
            Add Contestant
          </button>
        </div>
      )}

      {/* Add Contestant Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="bg-gradient-to-r from-purple-600 to-blue-600 px-6 py-5 rounded-t-2xl">
              <h3 className="text-xl font-bold text-white">Add New Contestant</h3>
              <p className="text-purple-100 text-sm mt-1">Register a new contestant for {event?.eventName}</p>
            </div>
            <div className="p-6">
              <form onSubmit={(e) => { e.preventDefault(); handleAddContestant(); }} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Contestant Number <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="contestantNumber"
                      value={formData.contestantNumber}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-600 focus:border-purple-600 transition-all duration-200 bg-white"
                      placeholder="e.g., 001"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Age <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      name="age"
                      value={formData.age}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-600 focus:border-purple-600 transition-all duration-200 bg-white"
                      placeholder="Age"
                      min="1"
                      max="100"
                      required
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      First Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="firstName"
                      value={formData.firstName}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-600 focus:border-purple-600 transition-all duration-200 bg-white"
                      placeholder="First name"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Last Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="lastName"
                      value={formData.lastName}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-600 focus:border-purple-600 transition-all duration-200 bg-white"
                      placeholder="Last name"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Address <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="address"
                    value={formData.address}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-600 focus:border-purple-600 transition-all duration-200 bg-white"
                    placeholder="Complete address"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Contact Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    name="contactNumber"
                    value={formData.contactNumber}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-600 focus:border-purple-600 transition-all duration-200 bg-white"
                    placeholder="09XX-XXX-XXXX"
                    required
                  />
                </div>

                
                <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-gray-100">
                  <button
                    type="submit"
                    className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600 text-white py-3 px-6 rounded-xl hover:from-purple-700 hover:to-blue-700 transition-all duration-200 font-semibold shadow-lg hover:shadow-xl transform hover:scale-[1.02]"
                  >
                    <span className="flex items-center justify-center gap-2">
                      <span>➕</span>
                      Add Contestant
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowAddModal(false); resetForm(); }}
                    className="flex-1 bg-gray-100 text-gray-700 py-3 px-6 rounded-xl hover:bg-gray-200 transition-all duration-200 font-semibold"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Edit Contestant Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="bg-gradient-to-r from-purple-600 to-blue-600 px-6 py-5 rounded-t-2xl">
              <h3 className="text-xl font-bold text-white">Edit Contestant</h3>
              <p className="text-purple-100 text-sm mt-1">Update contestant information</p>
            </div>
            <div className="p-6">
              <form onSubmit={(e) => { e.preventDefault(); handleEditContestant(); }} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Contestant Number <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="contestantNumber"
                      value={formData.contestantNumber}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-600 focus:border-purple-600 transition-all duration-200 bg-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Age <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      name="age"
                      value={formData.age}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-600 focus:border-purple-600 transition-all duration-200 bg-white"
                      min="1"
                      max="100"
                      required
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      First Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="firstName"
                      value={formData.firstName}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-600 focus:border-purple-600 transition-all duration-200 bg-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Last Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="lastName"
                      value={formData.lastName}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-600 focus:border-purple-600 transition-all duration-200 bg-white"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Address <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="address"
                    value={formData.address}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-600 focus:border-purple-600 transition-all duration-200 bg-white"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Contact Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    name="contactNumber"
                    value={formData.contactNumber}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-600 focus:border-purple-600 transition-all duration-200 bg-white"
                    required
                  />
                </div>

                
                <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-gray-100">
                  <button
                    type="submit"
                    className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600 text-white py-3 px-6 rounded-xl hover:from-purple-700 hover:to-blue-700 transition-all duration-200 font-semibold shadow-lg hover:shadow-xl transform hover:scale-[1.02]"
                  >
                    <span className="flex items-center justify-center gap-2">
                      <span>💾</span>
                      Update Contestant
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowEditModal(false); setEditingContestant(null); resetForm(); }}
                    className="flex-1 bg-gray-100 text-gray-700 py-3 px-6 rounded-xl hover:bg-gray-200 transition-all duration-200 font-semibold"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Round Management Modal */}
      {showRoundModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-orange-600 to-red-600 px-6 py-5 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold text-white">🏆 Round Management</h3>
                  <p className="text-orange-100 text-sm mt-1">Manage competition rounds and contestant elimination</p>
                </div>
                <button
                  onClick={() => setShowRoundModal(false)}
                  className="text-white hover:text-orange-200 transition-colors p-1"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="p-6">
              {/* Current Round Display */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Current Round</label>
                <div className={`inline-flex items-center gap-2 px-4 py-3 text-lg font-bold rounded-xl ${getRoundColor(currentRound)}`}>
                  <span className="text-2xl">🏆</span>
                  {currentRound.charAt(0).toUpperCase() + currentRound.slice(1)}
                </div>
              </div>

              {/* Round Progress Info */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-sm text-gray-600 mb-1">Total Contestants</div>
                  <div className="text-2xl font-bold text-gray-900">{contestants.length}</div>
                </div>
                <div className="bg-green-50 rounded-lg p-4">
                  <div className="text-sm text-gray-600 mb-1">Active Contestants</div>
                  <div className="text-2xl font-bold text-green-600">
                    {contestants.filter(c => c.status !== 'eliminated').length}
                  </div>
                </div>
                <div className="bg-red-50 rounded-lg p-4">
                  <div className="text-sm text-gray-600 mb-1">Eliminated</div>
                  <div className="text-2xl font-bold text-red-600">
                    {contestants.filter(c => c.status === 'eliminated').length}
                  </div>
                </div>
              </div>

              {/* Round Actions */}
              <div className="space-y-4">
                {currentRound === 'preliminary' && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h4 className="font-semibold text-blue-900 mb-2">🎯 Advance to Semi-Final</h4>
                    <p className="text-sm text-blue-700 mb-4">
                      Top 10 contestants will advance to semi-final round. Remaining contestants will be eliminated.
                    </p>
                    <button
                      onClick={handleAdvanceRound}
                      className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg hover:bg-blue-700 transition-colors font-semibold"
                    >
                      Advance to Semi-Final Round
                    </button>
                  </div>
                )}

                {currentRound === 'semi-final' && (
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                    <h4 className="font-semibold text-orange-900 mb-2">🏅 Advance to Final Round</h4>
                    <p className="text-sm text-orange-700 mb-4">
                      Top 5 contestants will advance to final round. Remaining semi-finalists will be eliminated.
                    </p>
                    <button
                      onClick={handleAdvanceRound}
                      className="w-full bg-orange-600 text-white py-3 px-6 rounded-lg hover:bg-orange-700 transition-colors font-semibold"
                    >
                      Advance to Final Round
                    </button>
                  </div>
                )}

                {currentRound === 'final' && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <h4 className="font-semibold text-green-900 mb-2">🏆 Complete Competition</h4>
                    <p className="text-sm text-green-700 mb-4">
                      Final rankings will be calculated. Winner and runners-up will be declared.
                    </p>
                    <button
                      onClick={handleAdvanceRound}
                      className="w-full bg-green-600 text-white py-3 px-6 rounded-lg hover:bg-green-700 transition-colors font-semibold"
                    >
                      Complete Competition & Declare Winner
                    </button>
                  </div>
                )}

                {currentRound === 'completed' && (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <h4 className="font-semibold text-gray-900 mb-2">✅ Competition Completed</h4>
                    <p className="text-sm text-gray-700 mb-4">
                      This competition has been completed. Winners have been declared.
                    </p>
                    <div className="bg-green-100 text-green-800 p-3 rounded-lg">
                      <div className="font-semibold">🏆 Winner and rankings have been finalized!</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Manual Elimination Section */}
              {currentRound !== 'completed' && (
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <h4 className="font-semibold text-gray-900 mb-4">⚠️ Manual Elimination</h4>
                  <p className="text-sm text-gray-600 mb-4">
                    You can manually eliminate individual contestants if needed. Use this for disqualifications or special circumstances.
                  </p>
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-yellow-800">
                      <span className="text-xl">⚠️</span>
                      <span className="font-medium">Manual elimination cannot be undone!</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Modal Actions */}
              <div className="flex flex-col sm:flex-row gap-3 mt-6 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowRoundModal(false)}
                  className="flex-1 bg-gray-100 text-gray-700 py-3 px-6 rounded-xl hover:bg-gray-200 transition-all duration-200 font-semibold"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
