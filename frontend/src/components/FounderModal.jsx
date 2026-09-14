import React, { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

const FounderModal = ({ founder, isOpen, onClose }) => {
  // Prevent background scrolling and handle Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !founder) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="founder-modal-title"
        >
          {/* Subtle Dimmed Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-[3px]"
          />

          {/* Centered Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="relative bg-white rounded-3xl border border-[#EADBCE] shadow-[0_20px_50px_rgba(0,0,0,0.14)] w-full max-w-3xl max-h-[90vh] flex flex-col md:flex-row overflow-hidden z-10"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close modal"
              className="absolute top-4 right-4 z-20 bg-white/90 backdrop-blur-sm p-2 rounded-full text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-secondary"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Left Side: Portrait Image Column */}
            <div className="md:w-[280px] lg:w-[300px] shrink-0 p-6 sm:p-7 bg-[#FAF6F0] flex flex-col items-center justify-center border-b md:border-b-0 md:border-r border-[#EADBCE]/70">
              <div className="group/portrait relative w-44 h-56 sm:w-52 sm:h-64 md:w-full md:h-72 rounded-2xl overflow-hidden shadow-sm border border-gray-200/60 bg-gray-100 transition-all duration-300 ease-out hover:scale-105 hover:-translate-y-1.5 hover:shadow-xl cursor-pointer">
                <img
                  src={founder.image}
                  alt={founder.name}
                  className={`w-full h-full object-cover ${founder.imagePosition || "object-top"} transition-transform duration-500 ease-out group-hover/portrait:scale-110`}
                />
              </div>
            </div>

            {/* Right Side: Information Area */}
            <div className="flex-1 p-6 sm:p-8 overflow-y-auto max-h-[calc(90vh-1rem)] text-left">
              {/* Founder Header */}
              <div>
                <h3
                  id="founder-modal-title"
                  className="font-therapique text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 leading-snug"
                >
                  {founder.name}
                </h3>

                <div className="flex flex-wrap items-center gap-2 mt-1.5">
                  <span className="inline-block text-xs font-serif font-semibold text-gray-700 bg-secondary/70 px-2.5 py-0.5 rounded-md">
                    {founder.education || founder.title}
                  </span>
                  <span className="text-sm font-sans font-medium text-gray-600">
                    {founder.role || founder.description}
                  </span>
                </div>
              </div>

              {/* Divider */}
              <div className="h-px bg-gray-200/80 my-4 sm:my-5" />

              {/* About Section */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 font-sans">
                  About
                </h4>
                <p className="text-sm sm:text-[15px] text-gray-700 leading-relaxed font-sans">
                  {founder.about}
                </p>
              </div>

              {/* Contributions Section */}
              {founder.contributions && founder.contributions.length > 0 && (
                <div className="mt-5 space-y-2.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 font-sans">
                    Contributions
                  </h4>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm text-gray-700">
                    {founder.contributions.map((contribution, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-500 mt-2 shrink-0" />
                        <span className="leading-snug">{contribution}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default FounderModal;
