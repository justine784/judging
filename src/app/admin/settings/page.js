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
    <div className="p-6">
      {/* Page Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">⚙️ Settings</h1>
          <p className="text-gray-600">Configure system settings and preferences</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleResetSettings}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors flex items-center gap-2"
          >
            <span>🔄</span>
            Reset to Default
          </button>
          <button
            onClick={() => setShowEditModal(true)}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2"
          >
            <span>💾</span>
            Save Changes
          </button>
        </div>
      </div>

      {/* Success Message */}
      {message && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 text-green-700 rounded-lg">
          {message}
        </div>
      )}

      {/* Settings Tabs */}
      <div className="bg-white rounded-xl shadow-md overflow-hidden">
        {/* Tab Navigation */}
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === tab.id
                    ? 'border-purple-600 text-purple-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <span className="mr-2">{tab.icon}</span>
                {tab.name}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {/* General Settings */}
          {activeTab === 'general' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">General Settings</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    System Name
                  </label>
                  <input
                    type="text"
                    name="systemName"
                    value={settings.systemName}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Organization
                  </label>
                  <input
                    type="text"
                    name="organization"
                    value={settings.organization}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Admin Email
                  </label>
                  <input
                    type="email"
                    name="adminEmail"
                    value={settings.adminEmail}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Maximum Contestants
                  </label>
                  <input
                    type="number"
                    name="maxContestants"
                    value={settings.maxContestants}
                    onChange={handleInputChange}
                    min="1"
                    max="100"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Scoring Settings */}
          {activeTab === 'scoring' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Scoring Configuration</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Scoring System
                  </label>
                  <select
                    name="scoringSystem"
                    value={settings.scoringSystem}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                  >
                    <option value="weighted">Weighted Scoring</option>
                    <option value="simple">Simple Average</option>
                    <option value="custom">Custom Formula</option>
                  </select>
                </div>
                
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    name="autoRanking"
                    checked={settings.autoRanking}
                    onChange={handleInputChange}
                    className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
                  />
                  <label className="text-sm font-medium text-gray-700">
                    Enable automatic ranking after score updates
                  </label>
                </div>
                
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    name="allowJudgeComments"
                    checked={settings.allowJudgeComments}
                    onChange={handleInputChange}
                    className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
                  />
                  <label className="text-sm font-medium text-gray-700">
                    Allow judges to add comments to scores
                  </label>
                </div>
                
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    name="publicResults"
                    checked={settings.publicResults}
                    onChange={handleInputChange}
                    className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
                  />
                  <label className="text-sm font-medium text-gray-700">
                    Make results publicly viewable
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Judges Settings */}
          {activeTab === 'judges' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Judge Management</h3>
              
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-medium text-blue-900 mb-2">📋 Judge Permissions</h4>
                <p className="text-sm text-blue-800">
                  Configure what judges can see and do in the system. These settings affect all judge accounts.
                </p>
              </div>
              
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    defaultChecked
                    className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
                  />
                  <label className="text-sm font-medium text-gray-700">
                    Allow judges to view other judges' scores
                  </label>
                </div>
                
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    defaultChecked
                    className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
                  />
                  <label className="text-sm font-medium text-gray-700">
                    Allow judges to edit submitted scores
                  </label>
                </div>
                
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
                  />
                  <label className="text-sm font-medium text-gray-700">
                    Require judge approval before finalizing scores
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* System Settings */}
          {activeTab === 'system' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">System Configuration</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Backup Frequency
                  </label>
                  <select
                    name="backupFrequency"
                    value={settings.backupFrequency}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                  >
                    <option value="hourly">Hourly</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Session Timeout (minutes)
                  </label>
                  <input
                    type="number"
                    name="sessionTimeout"
                    value={settings.sessionTimeout}
                    onChange={handleInputChange}
                    min="5"
                    max="480"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                  />
                </div>
              </div>
              
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    name="darkMode"
                    checked={settings.darkMode}
                    onChange={handleInputChange}
                    className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
                  />
                  <label className="text-sm font-medium text-gray-700">
                    Enable dark mode (experimental)
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Notifications Settings */}
          {activeTab === 'notifications' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Notification Preferences</h3>
              
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    name="emailNotifications"
                    checked={settings.emailNotifications}
                    onChange={handleInputChange}
                    className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
                  />
                  <label className="text-sm font-medium text-gray-700">
                    Enable email notifications
                  </label>
                </div>
                
                <div className="ml-7 space-y-3">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      defaultChecked
                      className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
                    />
                    <label className="text-sm text-gray-600">
                      Notify when new judge accounts are created
                    </label>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      defaultChecked
                      className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
                    />
                    <label className="text-sm text-gray-600">
                      Notify when scores are submitted
                    </label>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      defaultChecked
                      className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
                    />
                    <label className="text-sm text-gray-600">
                      Send daily summary reports
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Save Changes Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Save Settings</h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to save these settings? This will update the system configuration immediately.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleSaveSettings}
                disabled={loading}
                className="flex-1 bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
              >
                {loading ? 'Saving...' : 'Save Settings'}
              </button>
              <button
                onClick={() => setShowEditModal(false)}
                className="flex-1 bg-gray-200 text-gray-800 py-2 px-4 rounded-lg hover:bg-gray-300 transition-colors"
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
