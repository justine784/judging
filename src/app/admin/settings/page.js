'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminSettings() {
  const [settings, setSettings] = useState({
    systemName: 'Judging Tabulation System',
    organization: 'Bongabong, Oriental Mindoro',
    adminEmail: 'admin@judging.com',
    maxContestants: 50,
    scoringSystem: 'weighted',
    autoRanking: true,
    allowJudgeComments: true,
    publicResults: false,
    backupFrequency: 'daily',
    sessionTimeout: 30,
    emailNotifications: true,
    darkMode: false
  });
  const [showEditModal, setShowEditModal] = useState(false);
  const [activeTab, setActiveTab] = useState('general');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const router = useRouter();

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setSettings(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSaveSettings = async () => {
    setLoading(true);
    setMessage('');
    
    // Simulate API call
    setTimeout(() => {
      setLoading(false);
      setMessage('Settings saved successfully!');
      setShowEditModal(false);
      
      // Clear message after 3 seconds
      setTimeout(() => setMessage(''), 3000);
    }, 1000);
  };

  const handleResetSettings = () => {
    if (confirm('Are you sure you want to reset all settings to default values?')) {
      setSettings({
        systemName: 'Judging Tabulation System',
        organization: 'Bongabong, Oriental Mindoro',
        adminEmail: 'admin@judging.com',
        maxContestants: 50,
        scoringSystem: 'weighted',
        autoRanking: true,
        allowJudgeComments: true,
        publicResults: false,
        backupFrequency: 'daily',
        sessionTimeout: 30,
        emailNotifications: true,
        darkMode: false
      });
      setMessage('Settings reset to default values');
      setTimeout(() => setMessage(''), 3000);
    }
  };

  const tabs = [
    { id: 'general', name: 'General', icon: '⚙️' },
    { id: 'scoring', name: 'Scoring', icon: '🏆' },
    { id: 'judges', name: 'Judges', icon: '🧑‍⚖️' },
    { id: 'system', name: 'System', icon: '🔧' },
    { id: 'notifications', name: 'Notifications', icon: '🔔' }
  ];

  return (
    <div className="p-3 sm:p-6">
      {/* Enhanced Page Header */}
      <div className="relative overflow-hidden rounded-2xl mb-6 sm:mb-8">
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600"></div>
        <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-white/5"></div>
        <div className="relative p-5 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white drop-shadow-lg mb-2">⚙️ Settings</h1>
              <p className="text-emerald-100 text-sm sm:text-base">Configure system settings and preferences</p>
            </div>
            <div className="flex gap-2 sm:gap-3">
              <button
                onClick={handleResetSettings}
                className="px-4 py-2.5 bg-white/20 backdrop-blur-sm text-white rounded-xl hover:bg-white/30 transition-all flex items-center gap-2 text-sm sm:text-base border border-white/30 font-medium"
              >
                <span>🔄</span>
                <span className="hidden sm:inline">Reset to Default</span>
                <span className="sm:hidden">Reset</span>
              </button>
              <button
                onClick={() => setShowEditModal(true)}
                className="px-4 py-2.5 bg-white text-emerald-700 rounded-xl hover:bg-emerald-50 transition-all flex items-center gap-2 text-sm sm:text-base font-semibold shadow-lg border border-white/50"
              >
                <span>💾</span>
                <span className="hidden sm:inline">Save Changes</span>
                <span className="sm:hidden">Save</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Enhanced Success Message */}
      {message && (
        <div className="mb-4 sm:mb-6 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 text-emerald-700 px-4 py-3.5 rounded-xl shadow-sm">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 bg-emerald-100 rounded-lg flex items-center justify-center">
              <span className="text-lg">✅</span>
            </div>
            <span className="font-medium">{message}</span>
          </div>
        </div>
      )}

      {/* Enhanced Settings Tabs */}
      <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
        {/* Enhanced Tab Navigation */}
        <div className="bg-gradient-to-r from-slate-50 to-gray-50 border-b border-gray-100">
          <nav className="flex overflow-x-auto px-2 sm:px-4">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-4 sm:py-5 px-3 sm:px-5 border-b-3 font-medium text-xs sm:text-sm transition-all whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-b-2 border-emerald-500 text-emerald-600 bg-white'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span className="mr-1.5 sm:mr-2 text-base">{tab.icon}</span>
                <span className="hidden sm:inline">{tab.name}</span>
                <span className="sm:hidden">{tab.name.slice(0, 3)}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-4 sm:p-6">
          {/* General Settings */}
          {activeTab === 'general' && (
            <div className="space-y-4 sm:space-y-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl flex items-center justify-center shadow-lg">
                  <span className="text-white text-lg">⚙️</span>
                </div>
                <h3 className="text-lg sm:text-xl font-bold text-gray-800">General Settings</h3>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                <div className="group">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    System Name
                  </label>
                  <input
                    type="text"
                    name="systemName"
                    value={settings.systemName}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm sm:text-base transition-all bg-gray-50/50 hover:bg-white"
                  />
                </div>
                
                <div className="group">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Organization
                  </label>
                  <input
                    type="text"
                    name="organization"
                    value={settings.organization}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm sm:text-base transition-all bg-gray-50/50 hover:bg-white"
                  />
                </div>
                
                <div className="group">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Admin Email
                  </label>
                  <input
                    type="email"
                    name="adminEmail"
                    value={settings.adminEmail}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm sm:text-base transition-all bg-gray-50/50 hover:bg-white"
                  />
                </div>
                
                <div className="group">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Maximum Contestants
                  </label>
                  <input
                    type="number"
                    name="maxContestants"
                    value={settings.maxContestants}
                    onChange={handleInputChange}
                    min="1"
                    max="100"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm sm:text-base transition-all bg-gray-50/50 hover:bg-white"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Scoring Settings */}
          {activeTab === 'scoring' && (
            <div className="space-y-4 sm:space-y-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 bg-gradient-to-br from-amber-500 to-orange-500 rounded-xl flex items-center justify-center shadow-lg">
                  <span className="text-white text-lg">🏆</span>
                </div>
                <h3 className="text-lg sm:text-xl font-bold text-gray-800">Scoring Configuration</h3>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Scoring System
                  </label>
                  <select
                    name="scoringSystem"
                    value={settings.scoringSystem}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm sm:text-base transition-all bg-gray-50/50 hover:bg-white"
                  >
                    <option value="weighted">Weighted Scoring</option>
                    <option value="simple">Simple Average</option>
                    <option value="custom">Custom Formula</option>
                  </select>
                </div>
                
                <div className="space-y-3 bg-gradient-to-br from-amber-50/50 to-orange-50/50 rounded-xl p-4 border border-amber-100">
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      name="autoRanking"
                      checked={settings.autoRanking}
                      onChange={handleInputChange}
                      className="w-5 h-5 text-emerald-600 rounded-lg focus:ring-emerald-500 border-gray-300"
                    />
                    <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900 transition-colors">
                      Enable automatic ranking after score updates
                    </span>
                  </label>
                  
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      name="allowJudgeComments"
                      checked={settings.allowJudgeComments}
                      onChange={handleInputChange}
                      className="w-5 h-5 text-emerald-600 rounded-lg focus:ring-emerald-500 border-gray-300"
                    />
                    <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900 transition-colors">
                      Allow judges to add comments to scores
                    </span>
                  </label>
                  
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      name="publicResults"
                      checked={settings.publicResults}
                      onChange={handleInputChange}
                      className="w-5 h-5 text-emerald-600 rounded-lg focus:ring-emerald-500 border-gray-300"
                    />
                    <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900 transition-colors">
                      Make results publicly viewable
                    </span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Judges Settings */}
          {activeTab === 'judges' && (
            <div className="space-y-4 sm:space-y-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-xl flex items-center justify-center shadow-lg">
                  <span className="text-white text-lg">🧑‍⚖️</span>
                </div>
                <h3 className="text-lg sm:text-xl font-bold text-gray-800">Judge Management</h3>
              </div>
              
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4">
                <h4 className="font-semibold text-blue-900 mb-2 text-sm sm:text-base flex items-center gap-2">
                  <span>🔐</span> Judge Permissions
                </h4>
                <p className="text-sm text-blue-800 mb-4">
                  Configure what judges can see and do in the system. These settings affect all judge accounts.
                </p>
              </div>
              
              <div className="space-y-3 bg-gradient-to-br from-blue-50/50 to-indigo-50/50 rounded-xl p-4 border border-blue-100">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    defaultChecked
                    className="w-5 h-5 text-emerald-600 rounded-lg focus:ring-emerald-500 border-gray-300"
                  />
                  <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900 transition-colors">
                    Allow judges to view other judges' scores
                  </span>
                </label>
                
                <label className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    defaultChecked
                    className="w-5 h-5 text-emerald-600 rounded-lg focus:ring-emerald-500 border-gray-300"
                  />
                  <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900 transition-colors">
                    Allow judges to edit submitted scores
                  </span>
                </label>
                
                <label className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    className="w-5 h-5 text-emerald-600 rounded-lg focus:ring-emerald-500 border-gray-300"
                  />
                  <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900 transition-colors">
                    Require judge approval before finalizing scores
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* System Settings */}
          {activeTab === 'system' && (
            <div className="space-y-4 sm:space-y-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 bg-gradient-to-br from-purple-500 to-violet-500 rounded-xl flex items-center justify-center shadow-lg">
                  <span className="text-white text-lg">🖥️</span>
                </div>
                <h3 className="text-lg sm:text-xl font-bold text-gray-800">System Configuration</h3>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                <div className="group">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Backup Frequency
                  </label>
                  <select
                    name="backupFrequency"
                    value={settings.backupFrequency}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm sm:text-base transition-all bg-gray-50/50 hover:bg-white"
                  >
                    <option value="hourly">Hourly</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
                
                <div className="group">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Session Timeout (minutes)
                  </label>
                  <input
                    type="number"
                    name="sessionTimeout"
                    value={settings.sessionTimeout}
                    onChange={handleInputChange}
                    min="5"
                    max="480"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm sm:text-base transition-all bg-gray-50/50 hover:bg-white"
                  />
                </div>
              </div>
              
              <div className="space-y-3 bg-gradient-to-br from-purple-50/50 to-violet-50/50 rounded-xl p-4 border border-purple-100">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    name="darkMode"
                    checked={settings.darkMode}
                    onChange={handleInputChange}
                    className="w-5 h-5 text-emerald-600 rounded-lg focus:ring-emerald-500 border-gray-300"
                  />
                  <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900 transition-colors">
                    Enable dark mode (experimental)
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* Notifications Settings */}
          {activeTab === 'notifications' && (
            <div className="space-y-4 sm:space-y-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 bg-gradient-to-br from-rose-500 to-pink-500 rounded-xl flex items-center justify-center shadow-lg">
                  <span className="text-white text-lg">🔔</span>
                </div>
                <h3 className="text-lg sm:text-xl font-bold text-gray-800">Notification Preferences</h3>
              </div>
              
              <div className="space-y-4 bg-gradient-to-br from-rose-50/50 to-pink-50/50 rounded-xl p-4 border border-rose-100">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    name="emailNotifications"
                    checked={settings.emailNotifications}
                    onChange={handleInputChange}
                    className="w-5 h-5 text-emerald-600 rounded-lg focus:ring-emerald-500 border-gray-300"
                  />
                  <span className="text-sm font-semibold text-gray-700 group-hover:text-gray-900 transition-colors">
                    Enable email notifications
                  </span>
                </label>
                
                <div className="ml-4 sm:ml-8 space-y-3 pt-2 border-l-2 border-rose-200 pl-4">
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      defaultChecked
                      className="w-5 h-5 text-emerald-600 rounded-lg focus:ring-emerald-500 border-gray-300"
                    />
                    <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900 transition-colors">
                      Notify when new judge accounts are created
                    </span>
                  </label>
                  
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      defaultChecked
                      className="w-5 h-5 text-emerald-600 rounded-lg focus:ring-emerald-500 border-gray-300"
                    />
                    <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900 transition-colors">
                      Notify when scores are submitted
                    </span>
                  </label>
                  
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      defaultChecked
                      className="w-5 h-5 text-emerald-600 rounded-lg focus:ring-emerald-500 border-gray-300"
                    />
                    <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900 transition-colors">
                      Send daily summary reports
                    </span>
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Enhanced Save Changes Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 px-5 py-4">
              <h3 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                <span>💾</span> Save Settings
              </h3>
            </div>
            
            {/* Modal Content */}
            <div className="p-4 sm:p-6">
              <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-4 mb-5">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <span className="text-xl">⚠️</span>
                  </div>
                  <p className="text-sm text-amber-800">
                    Are you sure you want to save these settings? This will update system configuration immediately.
                  </p>
                </div>
              </div>
              
              <div className="flex gap-3">
                <button
                  onClick={handleSaveSettings}
                  disabled={loading}
                  className="flex-1 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 text-white py-3 px-4 rounded-xl hover:from-emerald-700 hover:via-teal-700 hover:to-cyan-700 transition-all disabled:opacity-50 text-sm sm:text-base font-semibold shadow-lg"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Saving...
                    </span>
                  ) : 'Save Settings'}
                </button>
                <button
                  onClick={() => setShowEditModal(false)}
                  className="flex-1 bg-gray-100 text-gray-700 py-3 px-4 rounded-xl hover:bg-gray-200 transition-all text-sm sm:text-base font-semibold border border-gray-200"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
