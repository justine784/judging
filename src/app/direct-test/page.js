'use client';

import { useState } from 'react';

export default function DirectTest() {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const testFirebaseAPI = async () => {
    setLoading(true);
    try {
      const response = await fetch('/firebase-test');
      const data = await response.json();
      setResult(data);
    } catch (error) {
      setResult({ error: error.message });
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Direct Firebase API Test</h1>
        
        <button
          onClick={testFirebaseAPI}
          disabled={loading}
          className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 mb-6"
        >
          {loading ? 'Testing...' : 'Test Firebase API'}
        </button>

        {result && (
          <div className="space-y-6">
            <div className={`p-6 rounded-lg ${result.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'} border`}>
              <h2 className="text-xl font-semibold mb-4">
                {result.success ? '✅ API Test Results' : '❌ API Test Failed'}
              </h2>
              
              <div className="space-y-2">
                <p><strong>Status:</strong> {result.status} {result.statusText}</p>
                {result.config && (
                  <div className="mt-4">
                    <h3 className="font-semibold">Configuration:</h3>
                    <ul className="list-disc list-inside text-sm">
                      <li>Project ID: {result.config.projectId}</li>
                      <li>Auth Domain: {result.config.authDomain}</li>
                      <li>API Key Valid: {result.config.apiKeyValid ? '✅' : '❌'}</li>
                      <li>API Key Length: {result.config.apiKeyLength}</li>
                    </ul>
                  </div>
                )}
              </div>
            </div>

            {result.data && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
                <h3 className="text-lg font-semibold mb-4">API Response Data:</h3>
                <pre className="text-xs bg-white p-4 rounded border overflow-auto">
                  {JSON.stringify(result.data, null, 2)}
                </pre>
              </div>
            )}

            {result.error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-6">
                <h3 className="text-lg font-semibold mb-4 text-red-800">Error:</h3>
                <p className="text-red-700">{result.error}</p>
              </div>
            )}

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-4 text-blue-800">What This Test Shows:</h3>
              <ul className="list-disc list-inside space-y-2 text-sm">
                <li>If you see "INVALID_API_KEY" or "API_KEY_NOT_FOUND", your API key is invalid</li>
                <li>If you see "PROJECT_NOT_FOUND", your project ID is wrong</li>
                <li>If you see "EMAIL_NOT_FOUND" or "INVALID_PASSWORD", the API is working but user doesn't exist</li>
                <li>If you see "IDENTITY_TOOLKIT_MISSING_OR_INVALID_API_KEY", Email/Password auth is not enabled</li>
              </ul>
            </div>
          </div>
        )}

        <div className="mt-8">
          <a href="/admin/login" className="bg-gray-600 text-white px-6 py-2 rounded-lg hover:bg-gray-700 inline-block">
            Back to Login
          </a>
        </div>
      </div>
    </div>
  );
}
