'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getDocs, collection, query, orderBy, limit, onSnapshot, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import PasswordResetVerification from '@/components/PasswordResetVerification';

export default function AdminDashboard() {
  const router = useRouter();
  const [stats, setStats] = useState({
    totalContestants: 0,
    totalJudges: 0,
    totalEvents: 0,
    ongoingEvents: 0,
    scoringProgress: 0
  });
  const [loading, setLoading] = useState(true);
  const [recentActivities, setRecentActivities] = useState([]);
  const [showExportDropdown, setShowExportDropdown] = useState(false);
  const [events, setEvents] = useState([]);
  const [selectedEventForPrint, setSelectedEventForPrint] = useState(null);
  const [showEventSelector, setShowEventSelector] = useState(false);

  useEffect(() => {
    // Load dashboard statistics
    const loadStats = async () => {
      try {
        // Fetch actual data from Firestore
        const judgesCollection = collection(db, 'judges');
        const judgesSnapshot = await getDocs(judgesCollection);
        const actualJudgeCount = judgesSnapshot.size;
        
        const eventsCollection = collection(db, 'events');
        const eventsSnapshot = await getDocs(eventsCollection);
        const actualEventCount = eventsSnapshot.size;
        
        const contestantsCollection = collection(db, 'contestants');
        const contestantsSnapshot = await getDocs(contestantsCollection);
        const actualContestantCount = contestantsSnapshot.size;
        
        // Calculate scoring progress
        let scoredContestants = 0;
        contestantsSnapshot.forEach(doc => {
          const contestant = doc.data();
          if (contestant.totalWeightedScore > 0) {
            scoredContestants++;
          }
        });
        
        const scoringProgress = actualContestantCount > 0 
          ? Math.round((scoredContestants / actualContestantCount) * 100)
          : 0;
        
        // Count ongoing events
        let ongoingEvents = 0;
        eventsSnapshot.forEach(doc => {
          if (doc.data().status === 'ongoing') {
            ongoingEvents++;
          }
        });

        // Store events for print selector
        const eventsList = eventsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setEvents(eventsList);
        
        // Auto-select first event for printing
        if (eventsList.length > 0 && !selectedEventForPrint) {
          setSelectedEventForPrint(eventsList[0]);
        }
        
        setStats({
          totalContestants: actualContestantCount,
          totalJudges: actualJudgeCount,
          totalEvents: actualEventCount,
          ongoingEvents: ongoingEvents,
          scoringProgress: scoringProgress
        });

        // Load recent activities
        loadRecentActivities();
      } catch (error) {
        console.error('Error loading stats:', error);
        // Fallback to sample data on error
        setStats({
          totalContestants: 0,
          totalJudges: 0,
          totalEvents: 0,
          ongoingEvents: 0,
          scoringProgress: 0
        });
      }
      setLoading(false);
    };

    const loadRecentActivities = async () => {
      try {
        const activities = [];
        
        // Get recent contestants
        const contestantsQuery = query(
          collection(db, 'contestants'),
          orderBy('createdAt', 'desc'),
          limit(3)
        );
        
        const contestantsSnapshot = await getDocs(contestantsQuery);
        contestantsSnapshot.forEach(doc => {
          const contestant = doc.data();
          const createdAt = contestant.createdAt?.toDate?.() || new Date();
          activities.push({
            type: 'contestant',
            title: 'New contestant registered',
            description: `${contestant.firstName || ''} ${contestant.lastName || ''} joined ${contestant.eventName || 'an event'}`,
            timestamp: createdAt,
            icon: '👤',
            color: 'green'
          });
        });

        // Get recent events with status changes
        const eventsQuery = query(
          collection(db, 'events'),
          orderBy('updatedAt', 'desc'),
          limit(2)
        );
        
        const eventsSnapshot = await getDocs(eventsQuery);
        eventsSnapshot.forEach(doc => {
          const event = doc.data();
          const updatedAt = event.updatedAt?.toDate?.() || new Date();
          activities.push({
            type: 'event',
            title: 'Event status updated',
            description: `${event.eventName} moved to ${event.status} status`,
            timestamp: updatedAt,
            icon: '🎭',
            color: 'purple'
          });
        });

        // Get recent judges
        const judgesQuery = query(
          collection(db, 'judges'),
          orderBy('createdAt', 'desc'),
          limit(2)
        );
        
        const judgesSnapshot = await getDocs(judgesQuery);
        judgesSnapshot.forEach(doc => {
          const judge = doc.data();
          const createdAt = judge.createdAt?.toDate?.() || new Date();
          activities.push({
            type: 'judge',
            title: 'New judge registered',
            description: `${judge.name || judge.email} joined as judge`,
            timestamp: createdAt,
            icon: '🧑‍⚖️',
            color: 'blue'
          });
        });

        // Sort by timestamp and take latest 5
        activities.sort((a, b) => b.timestamp - a.timestamp);
        setRecentActivities(activities.slice(0, 5));
        
      } catch (error) {
        console.error('Error loading recent activities:', error);
        // Fallback to empty array
        setRecentActivities([]);
      }
    };

    loadStats();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showExportDropdown && !event.target.closest('.export-dropdown')) {
        setShowExportDropdown(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showExportDropdown]);

  const getProgressColor = (progress) => {
    if (progress >= 80) return 'text-black';
    if (progress >= 50) return 'text-black';
    return 'text-black';
  };

  const getProgressBg = (progress) => {
    if (progress >= 80) return 'bg-green-100';
    if (progress >= 50) return 'bg-yellow-100';
    return 'bg-red-100';
  };

  const formatTimeAgo = (timestamp) => {
    const now = new Date();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} min ago`;
    if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    return `${days} day${days > 1 ? 's' : ''} ago`;
  };

  const getActivityColor = (color) => {
    switch(color) {
      case 'green': return 'bg-green-50 border-green-100 hover:bg-green-100';
      case 'blue': return 'bg-green-50 border-green-100 hover:bg-green-100';
      case 'purple': return 'bg-green-50 border-green-100 hover:bg-green-100';
      default: return 'bg-gray-50 border-gray-100 hover:bg-gray-100';
    }
  };

  const getActivityIconColor = (color) => {
    switch(color) {
      case 'green': return 'bg-green-500';
      case 'blue': return 'bg-green-500';
      case 'purple': return 'bg-green-500';
      default: return 'bg-gray-500';
    }
  };

  const getActivityBadgeColor = (color) => {
    switch(color) {
      case 'green': return 'bg-green-100 text-black';
      case 'blue': return 'bg-green-100 text-black';
      case 'purple': return 'bg-green-100 text-black';
      default: return 'bg-gray-100 text-black';
    }
  };

  const handlePrint = async () => {
    if (!selectedEventForPrint) {
      alert('Please select an event to print.');
      return;
    }

    try {
      // Fetch contestants for the selected event
      const contestantsQuery = query(
        collection(db, 'contestants'),
        where('eventId', '==', selectedEventForPrint.id)
      );
      const contestantsSnapshot = await getDocs(contestantsQuery);
      
      // Process contestants data
      const contestantsList = contestantsSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          name: data.contestantName || `${data.firstName || ''} ${data.lastName || ''}`.trim() || 'Unknown Contestant',
          number: data.contestantNumber || data.contestantNo || '',
          totalScore: data.totalWeightedScore || 0
        };
      }).sort((a, b) => b.totalScore - a.totalScore);

      // Create a new window for printing
      const printWindow = window.open('', '_blank');
      
      // Generate printable HTML with scoreboard
      const printContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>${selectedEventForPrint.eventName} - Scoreboard Report</title>
            <style>
              body { 
                font-family: Arial, sans-serif; 
                margin: 20px; 
                color: #333;
                line-height: 1.6;
              }
              .header { 
                text-align: center; 
                border-bottom: 2px solid #059669; 
                padding-bottom: 20px; 
                margin-bottom: 30px;
              }
              .header h1 { 
                color: #059669; 
                margin: 0;
                font-size: 28px;
              }
              .header h2 { 
                color: #666; 
                margin: 10px 0;
                font-size: 20px;
              }
              .header p { 
                color: #666; 
                margin: 5px 0;
                font-size: 14px;
              }
              .logo-container { 
                display: flex; 
                justify-content: center; 
                align-items: center; 
                margin-bottom: 20px;
              }
              .logo { 
                width: 80px; 
                height: 80px; 
                border-radius: 50%; 
                object-fit: cover; 
                border: 3px solid #059669;
                box-shadow: 0 4px 6px rgba(0,0,0,0.1);
              }
              .event-info { 
                background: #f8f9fa; 
                padding: 15px; 
                border-radius: 8px; 
                margin-bottom: 20px;
                border-left: 4px solid #059669;
              }
              .event-info h3 { 
                color: #059669; 
                margin: 0 0 10px 0;
                font-size: 18px;
              }
              .event-info p { 
                margin: 5px 0;
                font-size: 14px;
              }
              .scoreboard { 
                margin-bottom: 30px;
              }
              .scoreboard h2 { 
                color: #059669; 
                border-bottom: 1px solid #ddd; 
                padding-bottom: 10px;
                font-size: 20px;
              }
              table { 
                width: 100%; 
                border-collapse: collapse; 
                margin-top: 15px;
              }
              th, td { 
                border: 1px solid #ddd; 
                padding: 12px; 
                text-align: left;
              }
              th { 
                background-color: #059669; 
                color: white;
                font-weight: bold;
              }
              tr:nth-child(even) { 
                background-color: #f9f9f9;
              }
              .rank { 
                text-align: center; 
                font-weight: bold;
                font-size: 16px;
              }
              .score { 
                text-align: right; 
                font-weight: bold;
                font-size: 16px;
                color: #059669;
              }
              .no-score { 
                color: #999;
                font-style: italic;
              }
              .summary { 
                background: #f8f9fa; 
                padding: 15px; 
                border-radius: 8px; 
                margin-bottom: 20px;
              }
              .summary-grid { 
                display: grid; 
                grid-template-columns: repeat(3, 1fr); 
                gap: 15px;
              }
              .summary-item { 
                text-align: center;
                padding: 10px;
                background: white;
                border-radius: 6px;
                border: 1px solid #ddd;
              }
              .summary-item h4 { 
                margin: 0 0 5px 0;
                color: #059669;
                font-size: 24px;
              }
              .summary-item p { 
                margin: 0;
                font-size: 12px;
                color: #666;
              }
              .footer { 
                margin-top: 40px; 
                padding-top: 20px; 
                border-top: 1px solid #ddd; 
                text-align: center; 
                color: #666;
                font-size: 12px;
              }
              @media print {
                body { margin: 10px; }
                .summary-grid { grid-template-columns: repeat(3, 1fr); }
              }
            </style>
          </head>
          <body>
            <div class="header">
              <div class="logo-container">
                <img src="/logo.jpg" alt="Bongabong Logo" class="logo" />
              </div>
              <h1>🏆 Event Scoreboard Report</h1>
              <h2>${selectedEventForPrint.eventName}</h2>
              <p>Generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}</p>
              <p>Municipality of Bongabong, Oriental Mindoro</p>
            </div>

            <div class="event-info">
              <h3>📅 Event Details</h3>
              <p><strong>Date:</strong> ${selectedEventForPrint.date}</p>
              <p><strong>Time:</strong> ${selectedEventForPrint.time}</p>
              <p><strong>Venue:</strong> ${selectedEventForPrint.venue}</p>
              <p><strong>Status:</strong> ${selectedEventForPrint.status.charAt(0).toUpperCase() + selectedEventForPrint.status.slice(1)}</p>
            </div>

            <div class="summary">
              <div class="summary-grid">
                <div class="summary-item">
                  <h4>${contestantsList.length}</h4>
                  <p>Total Contestants</p>
                </div>
                <div class="summary-item">
                  <h4>${contestantsList.filter(c => c.totalScore > 0).length}</h4>
                  <p>Scored Contestants</p>
                </div>
                <div class="summary-item">
                  <h4>${contestantsList.length > 0 ? Math.round((contestantsList.filter(c => c.totalScore > 0).length / contestantsList.length) * 100) : 0}%</h4>
                  <p>Scoring Progress</p>
                </div>
              </div>
            </div>

            <div class="scoreboard">
              <h2>📊 Official Scoreboard</h2>
              ${contestantsList.length === 0 ? 
                '<p>No contestants registered for this event.</p>' :
                `<table>
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>Contestant Number</th>
                      <th>Name</th>
                      <th>Total Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${contestantsList.map((contestant, index) => `
                      <tr>
                        <td class="rank">${index + 1}</td>
                        <td>${contestant.number || 'N/A'}</td>
                        <td>${contestant.name}</td>
                        <td class="score ${contestant.totalScore === 0 ? 'no-score' : ''}">
                          ${contestant.totalScore === 0 ? 'Not Scored' : contestant.totalScore.toFixed(1)}
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>`
              }
            </div>

            ${selectedEventForPrint.criteria && selectedEventForPrint.criteria.length > 0 ? `
              <div class="scoreboard">
                <h2>📋 Judging Criteria</h2>
                <table>
                  <thead>
                    <tr>
                      <th>Criteria</th>
                      <th>Weight</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${selectedEventForPrint.criteria.map(criteria => `
                      <tr>
                        <td>${criteria.name}</td>
                        <td>${criteria.weight}%</td>
                        <td>${criteria.enabled ? '✅ Enabled' : '❌ Disabled'}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            ` : ''}

            <div class="footer">
              <div class="logo-container" style="margin-bottom: 15px;">
                <img src="/logo.jpg" alt="Bongabong Logo" class="logo" style="width: 60px; height: 60px;" />
              </div>
              <p>© 2026 Judging & Tabulation System | Developed by BSIT Students – Mindoro State University</p>
              <p>This report was generated automatically from the judging system database.</p>
              <p>Event ID: ${selectedEventForPrint.id}</p>
              <p>Municipality of Bongabong, Oriental Mindoro</p>
            </div>
          </body>
        </html>
      `;
      
      printWindow.document.write(printContent);
      printWindow.document.close();
      
      // Wait for content to load, then print
      printWindow.onload = function() {
        printWindow.print();
        printWindow.close();
      };
      
    } catch (error) {
      console.error('Print error:', error);
      alert('Failed to generate report. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50/30 to-teal-50/50">
      {/* Enhanced Header - Admin Dashboard */}
      <header className="relative w-full shadow-2xl border-b border-emerald-500/30 sticky top-0 z-25 overflow-hidden mb-4 sm:mb-6 lg:mb-8">
        {/* Animated Background Gradient */}
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600"></div>
        <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-white/5"></div>
        
        <div className="relative w-full px-3 sm:px-4 md:px-6 lg:px-8">
          <div className="py-4 sm:py-5 md:py-6">
            {/* Main Header Row */}
            <div className="flex flex-col gap-3 sm:gap-4">
              {/* Top Row - Logo, Title, and Actions */}
              <div className="flex items-center justify-between">
                {/* Left Section - Logo and Title */}
                <div className="flex items-center gap-2 sm:gap-3 md:gap-4 flex-1 min-w-0">
                  {/* Logo Container with Glow Effect */}
                  <div className="relative group flex-shrink-0">
                    <div className="absolute -inset-1 bg-gradient-to-r from-cyan-400 to-emerald-400 rounded-full blur opacity-40 group-hover:opacity-60 transition duration-300"></div>
                    <div className="relative h-10 w-10 sm:h-12 sm:w-12 md:h-14 md:w-14 rounded-full bg-white/95 backdrop-blur-sm shadow-2xl p-1 sm:p-1.5 border-2 border-white/50 ring-2 ring-emerald-400/30 flex items-center justify-center">
                      <span className="text-xl sm:text-2xl md:text-3xl">🛡️</span>
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <h1 className="text-lg sm:text-xl md:text-2xl lg:text-3xl xl:text-4xl font-extrabold text-white drop-shadow-lg tracking-tight truncate">
                      Admin Dashboard
                    </h1>
                    <p className="text-xs sm:text-sm text-emerald-100 font-medium drop-shadow-md mt-0.5 sm:mt-1">
                      Welcome back! Here's what's happening with your judging system today.
                    </p>
                  </div>
                </div>

                {/* Right Section - Status Badge (Desktop) */}
                <div className="hidden lg:flex items-center gap-3 md:gap-4 px-3 md:px-5 py-2 md:py-3 bg-white/10 backdrop-blur-md rounded-xl border border-white/20 shadow-lg">
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <div className="w-2.5 md:w-3 h-2.5 md:h-3 rounded-full bg-emerald-400 shadow-lg shadow-emerald-400/50"></div>
                      <div className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-75"></div>
                    </div>
                    <span className="font-semibold text-xs md:text-sm text-white">🟢 System Online</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons Row */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
                <button 
                  onClick={() => router.push('/admin/events')}
                  className="px-3 sm:px-4 md:px-6 py-2 sm:py-2.5 md:py-3 bg-white text-emerald-700 rounded-lg sm:rounded-xl hover:bg-emerald-50 transition-all duration-300 flex items-center justify-center gap-1.5 sm:gap-2 shadow-lg hover:shadow-xl transform hover:scale-105 text-xs sm:text-sm md:text-base font-semibold touch-manipulation active:scale-95 border border-white/50"
                >
                  <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path>
                  </svg>
                  <span className="hidden xs:inline">New Event</span>
                  <span className="xs:hidden">+ Event</span>
                </button>
            <div className="relative export-dropdown">
              <button 
                onClick={() => setShowExportDropdown(!showExportDropdown)}
                className="px-3 sm:px-4 md:px-6 py-2 sm:py-2.5 md:py-3 bg-white/20 backdrop-blur-sm text-white border border-white/30 rounded-lg sm:rounded-xl hover:bg-white/30 transition-all duration-300 flex items-center justify-center gap-1.5 sm:gap-2 shadow-md hover:shadow-lg text-xs sm:text-sm md:text-base font-medium"
              >
                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
                </svg>
                <span className="hidden xs:inline">Export</span>
                <span className="xs:hidden">⬇</span>
                <svg className="w-2.5 h-2.5 sm:w-3 sm:h-3 md:w-4 md:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                </svg>
              </button>
              
              {showExportDropdown && (
                <div className="absolute right-0 mt-2 w-56 sm:w-64 md:w-72 lg:w-80 bg-white rounded-xl shadow-2xl border border-gray-100 py-1 z-50 xs:z-[60] sm:z-50 overflow-hidden">
                  <div className="px-3 sm:px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-emerald-50 to-teal-50">
                    <label className="block text-xs font-semibold text-emerald-700 mb-1.5">Select Event</label>
                    <select
                      value={selectedEventForPrint?.id || ''}
                      onChange={(e) => {
                        const event = events.find(ev => ev.id === e.target.value);
                        setSelectedEventForPrint(event);
                      }}
                      className="w-full text-xs sm:text-sm px-3 py-2 border border-emerald-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 touch-manipulation bg-white"
                    >
                      {events.map((event) => (
                        <option key={event.id} value={event.id}>
                          {event.status === 'ongoing' ? '🎭' : event.status === 'upcoming' ? '📅' : '✅'} {event.eventName.length > 25 ? `${event.eventName.substring(0, 25)}...` : event.eventName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={() => { handlePrint(); setShowExportDropdown(false); }}
                    className="w-full text-left px-3 sm:px-4 py-3 text-xs sm:text-sm text-gray-700 hover:bg-emerald-50 flex items-center gap-2 touch-manipulation active:bg-emerald-100 transition-colors font-medium"
                  >
                    <span>🖨️</span>
                    <span className="hidden xs:inline">Print Event Scoreboard</span>
                    <span className="xs:hidden">Print</span>
                  </button>
                </div>
              )}
            </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full px-3 sm:px-4 md:px-6 lg:px-8 py-2 sm:py-4">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-gray-600 mb-4 sm:mb-6">
          <span className="hover:text-emerald-600 cursor-pointer transition-colors">🏠 Home</span>
          <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path>
          </svg>
          <span className="text-emerald-700 font-semibold">Dashboard</span>
        </nav>

      {/* Dashboard Grid - Enhanced Cards */}
      <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 xs:gap-4 sm:gap-6 mb-4 sm:mb-6 lg:mb-8">
        {/* Contestants Card */}
        <div 
          onClick={() => router.push('/admin/events')}
          className="group relative bg-white rounded-xl sm:rounded-2xl shadow-lg border border-emerald-100 p-3 xs:p-4 sm:p-5 lg:p-6 hover:shadow-2xl hover:shadow-emerald-500/10 transition-all duration-500 hover:-translate-y-1 overflow-hidden cursor-pointer touch-manipulation active:scale-95"
        >
          <div className="absolute top-0 right-0 w-20 sm:w-32 h-20 sm:h-32 bg-gradient-to-br from-emerald-500/10 to-teal-500/10 rounded-full -translate-y-10 sm:-translate-y-16 translate-x-10 sm:translate-x-16 group-hover:scale-150 transition-transform duration-500"></div>
          <div className="relative flex items-center justify-between mb-3 xs:mb-4 sm:mb-6">
            <div className="h-10 w-10 sm:h-12 sm:w-12 md:h-14 md:w-14 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/30 group-hover:scale-110 transition-transform duration-300">
              <span className="text-lg xs:text-xl sm:text-2xl lg:text-3xl">👥</span>
            </div>
            <div className="text-right">
              {loading ? (
                <div className="animate-pulse">
                  <div className="h-6 w-12 sm:h-8 sm:w-16 bg-emerald-100 rounded-lg"></div>
                </div>
              ) : (
                <span className="text-xl xs:text-2xl sm:text-3xl lg:text-4xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">{stats.totalContestants}</span>
              )}
            </div>
          </div>
          <div className="relative">
            <h3 className="font-bold text-gray-800 text-sm xs:text-base sm:text-lg mb-0.5 sm:mb-1">Contestants</h3>
            <p className="text-xs sm:text-sm text-gray-500 mb-2 xs:mb-3 sm:mb-4">Total registered</p>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 xs:gap-2">
                <div className="h-1.5 w-1.5 sm:h-2 sm:w-2 bg-emerald-500 rounded-full animate-pulse"></div>
                <span className="text-xs sm:text-sm text-slate-600 font-medium">
                  {loading ? 'Loading...' : `${stats.totalContestants} total`}
                </span>
              </div>
              <svg className="w-3 h-3 sm:w-4 sm:h-4 text-emerald-600 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path>
              </svg>
            </div>
          </div>
        </div>

        {/* Judges Card */}
        <div 
          onClick={() => router.push('/admin/judges')}
          className="group relative bg-white rounded-xl sm:rounded-2xl shadow-lg border border-blue-100 p-3 xs:p-4 sm:p-5 lg:p-6 hover:shadow-2xl hover:shadow-blue-500/10 transition-all duration-500 hover:-translate-y-1 overflow-hidden cursor-pointer touch-manipulation active:scale-95"
        >
          <div className="absolute top-0 right-0 w-20 sm:w-32 h-20 sm:h-32 bg-gradient-to-br from-blue-500/10 to-indigo-500/10 rounded-full -translate-y-10 sm:-translate-y-16 translate-x-10 sm:translate-x-16 group-hover:scale-150 transition-transform duration-500"></div>
          <div className="relative flex items-center justify-between mb-3 xs:mb-4 sm:mb-6">
            <div className="h-10 w-10 sm:h-12 sm:w-12 md:h-14 md:w-14 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/30 group-hover:scale-110 transition-transform duration-300">
              <span className="text-lg xs:text-xl sm:text-2xl lg:text-3xl">🧑‍⚖️</span>
            </div>
            <div className="text-right">
              {loading ? (
                <div className="animate-pulse">
                  <div className="h-6 w-12 sm:h-8 sm:w-16 bg-blue-100 rounded-lg"></div>
                </div>
              ) : (
                <span className="text-xl xs:text-2xl sm:text-3xl lg:text-4xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">{stats.totalJudges}</span>
              )}
            </div>
          </div>
          <div className="relative">
            <h3 className="font-bold text-gray-800 text-sm xs:text-base sm:text-lg mb-0.5 sm:mb-1">Judges</h3>
            <p className="text-xs sm:text-sm text-gray-500 mb-2 xs:mb-3 sm:mb-4">Active judges</p>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 xs:gap-2">
                <div className="h-1.5 w-1.5 sm:h-2 sm:w-2 bg-blue-500 rounded-full animate-pulse"></div>
                <span className="text-xs sm:text-sm text-slate-600 font-medium">
                  {loading ? 'Loading...' : `${stats.totalJudges} active`}
                </span>
              </div>
              <svg className="w-3 h-3 sm:w-4 sm:h-4 text-blue-600 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path>
              </svg>
            </div>
          </div>
        </div>

        {/* Events Card */}
        <div 
          onClick={() => router.push('/admin/events')}
          className="group relative bg-white rounded-xl sm:rounded-2xl shadow-lg border border-purple-100 p-3 xs:p-4 sm:p-5 lg:p-6 hover:shadow-2xl hover:shadow-purple-500/10 transition-all duration-500 hover:-translate-y-1 overflow-hidden cursor-pointer touch-manipulation active:scale-95"
        >
          <div className="absolute top-0 right-0 w-20 sm:w-32 h-20 sm:h-32 bg-gradient-to-br from-purple-500/10 to-pink-500/10 rounded-full -translate-y-10 sm:-translate-y-16 translate-x-10 sm:translate-x-16 group-hover:scale-150 transition-transform duration-500"></div>
          <div className="relative flex items-center justify-between mb-3 xs:mb-4 sm:mb-6">
            <div className="h-10 w-10 sm:h-12 sm:w-12 md:h-14 md:w-14 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-lg shadow-purple-500/30 group-hover:scale-110 transition-transform duration-300">
              <span className="text-lg xs:text-xl sm:text-2xl lg:text-3xl">🎯</span>
            </div>
            <div className="text-right">
              {loading ? (
                <div className="animate-pulse">
                  <div className="h-6 w-12 sm:h-8 sm:w-16 bg-purple-100 rounded-lg"></div>
                </div>
              ) : (
                <span className="text-xl xs:text-2xl sm:text-3xl lg:text-4xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">{stats.totalEvents}</span>
              )}
            </div>
          </div>
          <div className="relative">
            <h3 className="font-bold text-gray-800 text-sm xs:text-base sm:text-lg mb-0.5 sm:mb-1">Events</h3>
            <p className="text-xs sm:text-sm text-gray-500 mb-2 xs:mb-3 sm:mb-4">Total events</p>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 xs:gap-2">
                <div className="h-1.5 w-1.5 sm:h-2 sm:w-2 bg-purple-500 rounded-full animate-pulse"></div>
                <span className="text-xs sm:text-sm text-slate-600 font-medium">
                  {loading ? 'Loading...' : `${stats.ongoingEvents} ongoing`}
                </span>
              </div>
              <svg className="w-3 h-3 sm:w-4 sm:h-4 text-purple-600 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path>
              </svg>
            </div>
          </div>
        </div>

        {/* Progress Card */}
        <div 
          onClick={() => router.push('/scoreboard')}
          className="group relative bg-white rounded-xl sm:rounded-2xl shadow-lg border border-amber-100 p-3 xs:p-4 sm:p-5 lg:p-6 hover:shadow-2xl hover:shadow-amber-500/10 transition-all duration-500 hover:-translate-y-1 overflow-hidden cursor-pointer touch-manipulation active:scale-95"
        >
          <div className="absolute top-0 right-0 w-20 sm:w-32 h-20 sm:h-32 bg-gradient-to-br from-amber-500/10 to-orange-500/10 rounded-full -translate-y-10 sm:-translate-y-16 translate-x-10 sm:translate-x-16 group-hover:scale-150 transition-transform duration-500"></div>
          <div className="relative flex items-center justify-between mb-3 xs:mb-4 sm:mb-6">
            <div className="h-10 w-10 sm:h-12 sm:w-12 md:h-14 md:w-14 bg-gradient-to-br from-amber-500 to-orange-500 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/30 group-hover:scale-110 transition-transform duration-300">
              <span className="text-lg xs:text-xl sm:text-2xl lg:text-3xl">📊</span>
            </div>
            <div className="text-right">
              {loading ? (
                <div className="animate-pulse">
                  <div className="h-6 w-14 sm:h-8 sm:w-20 bg-amber-100 rounded-lg"></div>
                </div>
              ) : (
                <span className="text-xl xs:text-2xl sm:text-3xl lg:text-4xl font-bold bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent">
                  {stats.scoringProgress}%
                </span>
              )}
            </div>
          </div>
          <div className="relative">
            <h3 className="font-bold text-gray-800 text-sm xs:text-base sm:text-lg mb-0.5 sm:mb-1">Progress</h3>
            <p className="text-xs sm:text-sm text-gray-500 mb-2 xs:mb-3 sm:mb-4">Scoring completed</p>
            <div className="flex items-center justify-between gap-2">
              <div className="flex-1">
                {loading ? (
                  <div className="animate-pulse">
                    <div className="h-2 sm:h-2.5 bg-amber-100 rounded-full"></div>
                  </div>
                ) : (
                  <div className="w-full bg-gray-200 rounded-full h-2 sm:h-2.5 overflow-hidden">
                    <div 
                      className={`h-2 sm:h-2.5 rounded-full transition-all duration-700 ease-out ${
                        stats.scoringProgress >= 80 ? 'bg-gradient-to-r from-emerald-400 to-emerald-600' : 
                        stats.scoringProgress >= 50 ? 'bg-gradient-to-r from-amber-400 to-amber-600' : 'bg-gradient-to-r from-red-400 to-red-600'
                      }`}
                      style={{ width: `${stats.scoringProgress}%` }}
                    ></div>
                  </div>
                )}
              </div>
              <svg className="w-3 h-3 sm:w-4 sm:h-4 text-amber-600 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path>
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Password Reset Verification */}
      <PasswordResetVerification />

      {/* Recent Activity - Enhanced */}
      <div className="bg-white rounded-xl sm:rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
        <div className="relative bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 px-4 sm:px-6 py-4 sm:py-5">
          <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-white/5"></div>
          <div className="relative">
            <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2 sm:gap-3">
              <span className="text-xl sm:text-2xl">📈</span>
              Recent Activity
            </h2>
            <p className="text-emerald-100 text-xs sm:text-sm mt-1">Latest updates from your judging system</p>
          </div>
        </div>
        <div className="p-4 sm:p-6">
          {recentActivities.length === 0 ? (
            <div className="text-center py-8 sm:py-12">
              <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto bg-gradient-to-br from-gray-100 to-gray-200 rounded-2xl flex items-center justify-center mb-4">
                <span className="text-3xl sm:text-4xl">📋</span>
              </div>
              <h3 className="text-base sm:text-lg font-semibold text-gray-800 mb-2">No recent activity</h3>
              <p className="text-sm text-gray-500 max-w-md mx-auto">Activities will appear here as contestants, judges, and events are added to the system.</p>
            </div>
          ) : (
            <div className="space-y-3 sm:space-y-4">
              {recentActivities.map((activity, index) => (
                <div 
                  key={index}
                  className={`group flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 sm:p-4 rounded-xl border-2 transition-all duration-300 cursor-pointer hover:shadow-lg hover:-translate-y-0.5 ${getActivityColor(activity.color)}`}
                >
                  <div className="flex items-center gap-3 sm:gap-4 mb-2 sm:mb-0">
                    <div className={`h-10 w-10 sm:h-12 sm:w-12 ${getActivityIconColor(activity.color)} rounded-xl flex items-center justify-center flex-shrink-0 shadow-md group-hover:scale-110 transition-transform`}>
                      <span className="text-base sm:text-lg">{activity.icon}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-800 text-sm sm:text-base truncate pr-2">{activity.title}</p>
                      <p className="text-xs sm:text-sm text-gray-600 truncate pr-2">{activity.description}</p>
                    </div>
                  </div>
                  <div className="flex-shrink-0 ml-auto sm:ml-0">
                    <span className={`inline-flex items-center px-2.5 sm:px-3.5 py-1 sm:py-1.5 text-xs font-semibold rounded-full shadow-sm ${getActivityBadgeColor(activity.color)}`}>
                      {formatTimeAgo(activity.timestamp)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      </main>
      
      {/* Mobile Floating Action Button - Enhanced */}
      <div className="lg:hidden fixed bottom-6 right-6 z-40">
        <button
          onClick={() => router.push('/admin/events')}
          className="group relative w-14 h-14 sm:w-16 sm:h-16"
          aria-label="Add Event"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full blur opacity-40 group-hover:opacity-60 transition duration-300"></div>
          <div className="relative w-full h-full bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-full shadow-xl hover:shadow-2xl transform hover:scale-110 transition-all duration-300 flex items-center justify-center touch-manipulation active:scale-95 border-2 border-white/30">
            <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4"></path>
            </svg>
          </div>
        </button>
      </div>
    </div>
  );
}
