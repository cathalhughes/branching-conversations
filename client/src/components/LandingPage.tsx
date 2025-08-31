import React from 'react';

interface User {
  userId: string;
  userName: string;
  userEmail: string;
  color: string;
}

interface LandingPageProps {
  onUserSelect: (user: User) => void;
}

const DEMO_USERS = [
  { userId: 'user_demo_123', userName: 'Alex Chen', userEmail: 'alex@example.com', color: '#3B82F6' },
  { userId: 'user_demo_456', userName: 'Sarah Johnson', userEmail: 'sarah@example.com', color: '#10B981' },
  { userId: 'user_demo_789', userName: 'Mike Rodriguez', userEmail: 'mike@example.com', color: '#F59E0B' },
  { userId: 'user_demo_101', userName: 'Emma Davis', userEmail: 'emma@example.com', color: '#EF4444' },
];

const LandingPage: React.FC<LandingPageProps> = ({ onUserSelect }) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-800">
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-400 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-yellow-400 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob" style={{ animationDelay: '2s' }}></div>
        <div className="absolute top-40 left-40 w-80 h-80 bg-pink-400 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob" style={{ animationDelay: '4s' }}></div>
      </div>

      <div className="relative z-10 min-h-screen flex items-center justify-center p-6">
        <div className="max-w-4xl w-full">
          {/* Header */}
          <div className="text-center mb-16">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-white bg-opacity-20 backdrop-blur-lg rounded-full mb-8">
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <h1 className="text-5xl md:text-6xl font-bold text-white mb-6 leading-tight">
              Branching
              <br />
              <span className="bg-gradient-to-r from-yellow-400 via-pink-400 to-purple-400 bg-clip-text text-transparent">
                Conversations
              </span>
            </h1>
            <p className="text-xl md:text-2xl text-white text-opacity-90 max-w-2xl mx-auto leading-relaxed">
              Explore ideas through dynamic, branching conversations. 
              <br />
              <span className="text-lg opacity-80">Choose your identity and start collaborating.</span>
            </p>
          </div>

          {/* User Selection Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {DEMO_USERS.map((user, index) => (
              <div
                key={user.userId}
                className="group relative bg-white bg-opacity-10 backdrop-blur-lg rounded-2xl p-6 border border-white border-opacity-20 hover:bg-opacity-20 transition-all duration-300 cursor-pointer transform hover:scale-105 hover:-translate-y-2"
                onClick={() => onUserSelect(user)}
                style={{ animationDelay: `${index * 100}ms` }}
              >
                {/* User Avatar */}
                <div className="text-center mb-4">
                  <div 
                    className="inline-flex items-center justify-center w-16 h-16 rounded-full text-white font-semibold text-xl mb-3 shadow-lg"
                    style={{ backgroundColor: user.color }}
                  >
                    {user.userName.split(' ').map(n => n[0]).join('')}
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-1">
                    {user.userName}
                  </h3>
                  <p className="text-white text-opacity-70 text-sm">
                    {user.userEmail}
                  </p>
                </div>

                {/* Hover effect */}
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-transparent via-white to-transparent opacity-0 group-hover:opacity-10 transition-opacity duration-300"></div>
                
                {/* Click indicator */}
                <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </div>

                {/* Bottom accent */}
                <div 
                  className="absolute bottom-0 left-0 right-0 h-1 rounded-b-2xl opacity-50"
                  style={{ backgroundColor: user.color }}
                ></div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="text-center mt-16">
            <p className="text-white text-opacity-60 text-sm">
              Select a user above to begin your conversation journey
            </p>
          </div>
        </div>
      </div>

    </div>
  );
};

export default LandingPage;