'use client';

import { useState, useEffect } from 'react';

const ContestantSlideshow = ({ contestants, autoPlay = true, interval = 5000 }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [isPaused, setIsPaused] = useState(false);

  // Filter contestants that have photos
  const contestantsWithPhotos = contestants.filter(contestant => contestant.photo);

  useEffect(() => {
    if (!isPlaying || isPaused || contestantsWithPhotos.length <= 1) return;

    const timer = setInterval(() => {
      setCurrentIndex((prevIndex) => (prevIndex + 1) % contestantsWithPhotos.length);
    }, interval);

    return () => clearInterval(timer);
  }, [isPlaying, isPaused, interval, contestantsWithPhotos.length]);

  const goToPrevious = () => {
    setCurrentIndex((prevIndex) => 
      prevIndex === 0 ? contestantsWithPhotos.length - 1 : prevIndex - 1
    );
  };

  const goToNext = () => {
    setCurrentIndex((prevIndex) => (prevIndex + 1) % contestantsWithPhotos.length);
  };

  const goToSlide = (index) => {
    setCurrentIndex(index);
  };

  const togglePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const handleMouseEnter = () => {
    setIsPaused(true);
  };

  const handleMouseLeave = () => {
    setIsPaused(false);
  };

  if (contestantsWithPhotos.length === 0) {
    return (
      <div className="bg-gradient-to-br from-gray-100 to-gray-200 rounded-xl p-4 sm:p-8 text-center">
        <div className="text-gray-500 text-base sm:text-lg">📷 No contestant photos available</div>
        <p className="text-gray-400 text-xs sm:text-sm mt-2">Add photos to contestants to enable slideshow</p>
      </div>
    );
  }

  const currentContestant = contestantsWithPhotos[currentIndex];

  return (
    <div 
      className="relative bg-gradient-to-br from-blue-50 to-purple-50 rounded-xl overflow-hidden shadow-2xl"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Main Image Display */}
      <div className="relative bg-black">
        <div className="aspect-w-16 aspect-h-9">
          <img
            src={currentContestant.photo}
            alt={currentContestant.name || 'Contestant ' + (currentIndex + 1)}
            className="w-full h-64 sm:h-80 md:h-96 object-contain bg-black"
          />
        </div>
        
        {/* Overlay Information */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3 sm:p-6">
          <div className="text-white">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-2">
              <span className="text-xl sm:text-2xl md:text-3xl">🏆</span>
              <h3 className="text-lg sm:text-xl md:text-2xl font-bold truncate">{currentContestant.name || 'Contestant ' + (currentIndex + 1)}</h3>
              {currentContestant.contestantType === 'group' ? (
                <span className="bg-purple-500 text-white px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm">👥 Group</span>
              ) : (
                <span className="bg-blue-500 text-white px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm">🎤 Solo</span>
              )}
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-sm sm:text-lg">
              <span className="font-medium">#{currentContestant.number || currentIndex + 1}</span>
              <span className="font-bold text-yellow-400">
                Score: {(currentContestant.totalScore || 0).toFixed(1)}%
              </span>
              {(currentContestant.judgeCount || 0) > 0 && (
                <span className="text-xs sm:text-sm opacity-90">
                  {currentContestant.judgeCount || 0} judge{(currentContestant.judgeCount || 0) > 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Pause Indicator */}
        {isPaused && (
          <div className="absolute top-2 sm:top-4 right-2 sm:right-4 bg-black/50 text-white px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm">
            ⏸️ Paused
          </div>
        )}
      </div>

      {/* Navigation Controls */}
      <button
        onClick={goToPrevious}
        className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white text-gray-800 p-2 sm:p-3 rounded-full shadow-lg transition-all duration-200 hover:scale-110 touch-manipulation"
        aria-label="Previous contestant"
      >
        <svg className="w-4 h-4 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      <button
        onClick={goToNext}
        className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white text-gray-800 p-2 sm:p-3 rounded-full shadow-lg transition-all duration-200 hover:scale-110 touch-manipulation"
        aria-label="Next contestant"
      >
        <svg className="w-4 h-4 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {/* Play/Pause Control */}
      <button
        onClick={togglePlayPause}
        className="absolute bottom-2 sm:bottom-4 right-2 sm:right-4 bg-white/80 hover:bg-white text-gray-800 p-2 sm:p-3 rounded-full shadow-lg transition-all duration-200 hover:scale-110 touch-manipulation"
        aria-label={isPlaying ? "Pause slideshow" : "Play slideshow"}
      >
        {isPlaying ? (
          <svg className="w-4 h-4 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ) : (
          <svg className="w-4 h-4 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )}
      </button>

      {/* Slide Indicators */}
      <div className="absolute bottom-2 sm:bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 sm:gap-2 bg-black/50 px-2 sm:px-3 py-1 sm:py-2 rounded-full">
        {contestantsWithPhotos.map((_, index) => (
          <button
            key={index}
            onClick={() => goToSlide(index)}
            className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full transition-all duration-200 touch-manipulation ${
              index === currentIndex 
                ? 'bg-white w-4 sm:w-6' 
                : 'bg-white/50 hover:bg-white/75'
            }`}
            aria-label={`Go to slide ${index + 1}`}
          />
        ))}
      </div>

      {/* Contestant Counter */}
      <div className="absolute top-2 sm:top-4 left-2 sm:left-4 bg-black/50 text-white px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm">
        {currentIndex + 1} / {contestantsWithPhotos.length}
      </div>
    </div>
  );
};

export default ContestantSlideshow;
