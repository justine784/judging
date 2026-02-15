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
  const [event, setEvent] = useState(null);
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

  const loadEvent = async () => {
    try {
      // Load actual event from Firestore
      const eventDoc = await getDoc(doc(db, 'events', eventId));
      if (eventDoc.exists()) {
        setEvent({
          id: eventId,
          ...eventDoc.data()
        });
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
    return status === 'registered' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800';
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
          </div>
        </div>
      </div>

      {/* Event Info Card */}
      {event && (
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 rounded-xl p-6 mb-8 text-white">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <p className="text-purple-100 text-sm">Date</p>
              <p className="font-semibold">{event.date}</p>
            </div>
            <div>
              <p className="text-purple-100 text-sm">Time</p>
              <p className="font-semibold">{event.time}</p>
            </div>
            <div>
              <p className="text-purple-100 text-sm">Venue</p>
              <p className="font-semibold">{event.venue}</p>
            </div>
            <div>
              <p className="text-purple-100 text-sm">Total Contestants</p>
              <p className="font-semibold">{contestants.length}</p>
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
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => openEditModal(contestant)}
                        className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 hover:text-blue-700 transition-all duration-200 group"
                        title="Edit Contestant"
                      >
                        <span className="group-hover:scale-110 transition-transform">✏️</span>
                      </button>
                      <button
                        onClick={() => handleDeleteContestant(contestant.id)}
                        className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 hover:text-red-700 transition-all duration-200 group"
                        title="Remove Contestant"
                      >
                        <span className="group-hover:scale-110 transition-transform">🗑️</span>
                      </button>
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
    </div>
  );
}
