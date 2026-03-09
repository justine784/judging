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
    <div className="relative overflow-hidden shadow-[0_25px_60px_-15px_rgba(0,0,0,0.3)] mx-auto max-w-full rounded-xl sm:rounded-2xl border border-gray-700">
      {/* Main Image Display */}
      <div className="relative bg-gradient-to-b from-gray-800 to-gray-900">
        <div className="aspect-w-16 aspect-h-9">
          <img
            src={currentContestant.photo}
            alt={currentContestant.displayName || currentContestant.name || 'Contestant #' + currentContestant.contestantNumber}
            className="w-full h-56 sm:h-72 md:h-96 lg:h-[28rem] xl:h-[32rem] object-contain"
          />
        </div>
        
        {/* Overlay Information */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/60 to-transparent p-3 sm:p-4 md:p-5 lg:p-6">
          
          <div className="text-white">
                <div className="flex flex-col gap-1.5 sm:gap-2">
                  <h3 className="text-sm sm:text-base md:text-lg lg:text-xl xl:text-2xl font-bold drop-shadow-lg">{currentContestant.displayName || currentContestant.name || 'Contestant #' + currentContestant.contestantNumber}</h3>
                  
                  {/* Contestant Number and Score - Below Name */}
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <span className="font-bold text-xs sm:text-sm md:text-4xl lg:text-5xl xl:text-6xl bg-white/20 backdrop-blur-sm px-2 sm:px-3 md:px-7 py-0.5 sm:py-1 md:py-3 rounded-lg border border-white/20">#{currentContestant.contestantNumber}</span>
                    <span className="font-bold text-yellow-400 text-xs sm:text-sm md:text-4xl lg:text-5xl xl:text-6xl bg-white/10 backdrop-blur-sm px-2 sm:px-3 md:px-7 py-0.5 sm:py-1 md:py-3 rounded-lg border border-yellow-400/30">
                      {(currentContestant.totalScore || 0).toFixed(1)}%
                    </span>
                    {(currentContestant.judgeCount || 0) > 0 && (
                      <span className="text-xs sm:text-sm text-gray-300">
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
        <div className="absolute top-1 sm:top-2 md:top-4 right-1 sm:right-2 md:right-4 flex flex-col items-end gap-1">
          <div className={`inline-flex items-center justify-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-lg text-[10px] sm:text-xs md:text-sm font-semibold backdrop-blur-sm ${
            eventStatus === 'ongoing' 
              ? 'bg-red-500/90 text-white' 
              : eventStatus === 'upcoming'
              ? 'bg-blue-500/90 text-white'
              : 'bg-gray-500/90 text-white'
          }`}>
            <div className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${
              eventStatus === 'ongoing' ? 'bg-white animate-pulse' : 'bg-white/70'
            }`}></div>
            <span className="uppercase tracking-wide">
              {eventStatus === 'ongoing' ? 'Live' : 
               eventStatus === 'upcoming' ? 'Upcoming' : 'Finished'}
            </span>
          </div>
          {eventName && (
            <h4 className="text-white text-[10px] sm:text-xs md:text-sm font-bold bg-black/60 backdrop-blur-sm px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-lg text-right max-w-[150px] sm:max-w-[200px] truncate">
              {eventName}
            </h4>
          )}
        </div>
      )}

      {/* Navigation Controls */}
      <button
        onClick={goToPrevious}
        className="absolute left-2 sm:left-3 md:left-4 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 backdrop-blur-md text-white p-2 sm:p-2.5 md:p-3 rounded-full shadow-lg transition-all duration-300 hover:scale-110 touch-manipulation border border-white/20"
        aria-label="Previous contestant"
      >
        <svg className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      <button
        onClick={goToNext}
        className="absolute right-2 sm:right-3 md:right-4 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 backdrop-blur-md text-white p-2 sm:p-2.5 md:p-3 rounded-full shadow-lg transition-all duration-300 hover:scale-110 touch-manipulation border border-white/20"
        aria-label="Next contestant"
      >
        <svg className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {/* Slide Indicators */}
      <div className="absolute bottom-2 sm:bottom-3 md:bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 sm:gap-1.5 md:gap-2 bg-black/60 backdrop-blur-sm px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 rounded-full border border-white/10">
        {contestantsWithPhotos.map((_, index) => (
          <button
            key={index}
            onClick={() => goToSlide(index)}
            className={`rounded-full transition-all duration-300 touch-manipulation ${
              index === currentIndex 
                ? 'bg-white w-4 sm:w-5 md:w-6 h-1.5 sm:h-2' 
                : 'bg-white/40 hover:bg-white/60 w-1.5 sm:w-2 h-1.5 sm:h-2'
            }`}
            aria-label={`Go to slide ${index + 1}`}
          />
        ))}
      </div>

      {/* Contestant Counter */}
      <div className="absolute top-1 sm:top-2 md:top-4 left-1 sm:left-2 md:left-4 bg-black/70 backdrop-blur-sm text-white px-2.5 sm:px-3 md:px-4 py-1 sm:py-1.5 rounded-lg text-xs sm:text-sm font-medium border border-white/10">
        <span className="text-gray-300">Contestant</span> {currentIndex + 1} <span className="text-gray-400">of</span> {contestantsWithPhotos.length}
      </div>
    </div>
  );
};

export default ContestantSlideshow;
