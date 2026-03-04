'use client';

import { useState, useEffect } from 'react';

const ContestantSlideshow = ({ contestants, autoPlay = true, interval = 5000, eventName, eventStatus }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(autoPlay);

  // Filter contestants that have photos and sort by contestant number
  const contestantsWithPhotos = contestants
    .filter(contestant => contestant.photo)
    .sort((a, b) => {
      // Convert contestant numbers to integers for proper sorting
      const numA = parseInt(a.contestantNumber) || 0;
      const numB = parseInt(b.contestantNumber) || 0;
      return numA - numB;
    });

  useEffect(() => {
    if (!isPlaying || contestantsWithPhotos.length <= 1) return;

    const timer = setInterval(() => {
      setCurrentIndex((prevIndex) => (prevIndex + 1) % contestantsWithPhotos.length);
    }, interval);

    return () => clearInterval(timer);
  }, [isPlaying, interval, contestantsWithPhotos.length]);

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
    <div className="relative bg-gradient-to-br from-blue-50 to-purple-50 overflow-hidden shadow-2xl mx-auto max-w-full">
      {/* Main Image Display */}
      <div className="relative bg-transparent">
        <div className="aspect-w-16 aspect-h-9">
          <img
            src={currentContestant.photo}
            alt={currentContestant.displayName || currentContestant.name || 'Contestant #' + currentContestant.contestantNumber}
            className="w-full h-72 sm:h-96 md:h-[28rem] lg:h-[32rem] object-contain bg-transparent"
          />
        </div>
        
        {/* Overlay Information */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2 sm:p-3 md:p-4 lg:p-6">
          
          <div className="text-white">
                <div className="flex flex-col gap-2 sm:gap-3 mb-1 sm:mb-2">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 md:gap-3">
                    <h3 className="text-sm sm:text-base md:text-lg lg:text-xl xl:text-2xl font-bold truncate">{currentContestant.displayName || currentContestant.name || 'Contestant #' + currentContestant.contestantNumber}</h3>
                    {currentContestant.contestantType === 'group' && (
                      <span className="bg-purple-500 text-white px-1 sm:px-2 md:px-3 py-0.5 sm:py-1 rounded-full text-xs sm:text-sm">👥 Group</span>
                    )}
                  </div>
                  
                  {/* Contestant Number and Score - Below Name */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 md:gap-4 text-lg sm:text-xl md:text-2xl lg:text-3xl">
                    <span className="font-bold text-lg sm:text-xl md:text-2xl lg:text-3xl">#{currentContestant.contestantNumber}</span>
                    <span className="font-bold text-yellow-400 text-base sm:text-lg md:text-xl lg:text-2xl">
                      Score: {(currentContestant.totalScore || 0).toFixed(1)}%
                    </span>
                    {(currentContestant.judgeCount || 0) > 0 && (
                      <span className="text-base sm:text-lg md:text-xl opacity-90">
                        {currentContestant.judgeCount || 0} judge{(currentContestant.judgeCount || 0) > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>
          </div>
        </div>
      </div>

      {/* Event Information - Above Pagination Dots */}
      {(eventName || eventStatus) && (
        <div className="absolute bottom-8 sm:bottom-10 md:bottom-12 left-1/2 -translate-x-1/2 text-center">
          <div className={`inline-flex items-center gap-2 px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-medium mb-1 bg-black/60 text-white ${
            eventStatus === 'ongoing' 
              ? 'ring-1 ring-red-400' 
              : eventStatus === 'upcoming'
              ? 'ring-1 ring-blue-400'
              : 'ring-1 ring-gray-400'
          }`}>
            <div className={`w-1.5 h-1.5 rounded-full ${
              eventStatus === 'ongoing' ? 'bg-red-400 animate-pulse' : 
              eventStatus === 'upcoming' ? 'bg-blue-400' : 'bg-gray-400'
            }`}></div>
            <span className="uppercase tracking-wide">
              {eventStatus === 'ongoing' ? 'Live' : 
               eventStatus === 'upcoming' ? 'Upcoming' : 'Finished'}
            </span>
          </div>
          {eventName && (
            <h4 className="text-white text-sm sm:text-base md:text-lg font-bold truncate bg-black/60 px-3 py-1 rounded-full">
              {eventName}
            </h4>
          )}
        </div>
      )}

      {/* Navigation Controls */}
      <button
        onClick={goToPrevious}
        className="absolute left-1 sm:left-2 md:left-4 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white text-gray-800 p-1.5 sm:p-2 md:p-3 rounded-full shadow-lg transition-all duration-200 hover:scale-110 touch-manipulation"
        aria-label="Previous contestant"
      >
        <svg className="w-3 h-3 sm:w-4 sm:h-4 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      <button
        onClick={goToNext}
        className="absolute right-1 sm:right-2 md:right-4 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white text-gray-800 p-1.5 sm:p-2 md:p-3 rounded-full shadow-lg transition-all duration-200 hover:scale-110 touch-manipulation"
        aria-label="Next contestant"
      >
        <svg className="w-3 h-3 sm:w-4 sm:h-4 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {/* Slide Indicators */}
      <div className="absolute bottom-1 sm:bottom-2 md:bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-0.5 sm:gap-1 md:gap-2 bg-black/50 px-1 sm:px-2 md:px-3 py-0.5 sm:py-1 md:py-2 rounded-full">
        {contestantsWithPhotos.map((_, index) => (
          <button
            key={index}
            onClick={() => goToSlide(index)}
            className={`w-1 h-1 sm:w-1.5 sm:h-1.5 md:w-2 md:h-2 rounded-full transition-all duration-200 touch-manipulation ${
              index === currentIndex 
                ? 'bg-white w-2 sm:w-3 md:w-4 lg:w-6' 
                : 'bg-white/50 hover:bg-white/75'
            }`}
            aria-label={`Go to slide ${index + 1}`}
          />
        ))}
      </div>

      {/* Contestant Counter */}
      <div className="absolute top-1 sm:top-2 md:top-4 left-1 sm:left-2 md:left-4 bg-black/50 text-white px-1 sm:px-2 md:px-3 py-0.5 sm:py-1 rounded-full text-xs sm:text-xs md:text-sm">
        {currentIndex + 1} / {contestantsWithPhotos.length}
      </div>
    </div>
  );
};

export default ContestantSlideshow;
