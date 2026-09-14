import { ArrowRight } from "lucide-react";

const ProfileCard = ({ image, name, title, description, imagePosition = "object-top", onClick }) => {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
      aria-label={`View profile and contributions of ${name}`}
      style={{ transform: "translateZ(0)", backfaceVisibility: "hidden" }}
      className="bg-white rounded-2xl overflow-hidden w-full h-full flex flex-col font-sans group transition-all duration-300 ease-out hover:-translate-y-3 hover:scale-[1.02] shadow-[0_4px_20px_rgba(0,0,0,0.04)] hover:shadow-[0_20px_40px_rgba(0,0,0,0.12)] border border-gray-100/80 cursor-pointer focus:outline-none focus:ring-2 focus:ring-secondary/80 text-left transform-gpu"
    >
      {/* Profile Image Container with Consistent Aspect Ratio & Pop-Up Effect */}
      <div className="relative aspect-[4/5] sm:aspect-[3/4] w-full overflow-hidden bg-gray-100">
        <img
          src={image}
          alt={name}
          loading="eager"
          decoding="async"
          className={`w-full h-full object-cover ${imagePosition} group-hover:scale-108 group-hover:brightness-[1.03] transition-all duration-500 ease-out`}
        />
        {/* Top-Right Circular Arrow Button */}
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          className="absolute top-4 right-4 bg-secondary/90 backdrop-blur-sm rounded-full p-3.5 text-gray-700 shadow-sm transition-all duration-300 group-hover:bg-peach group-hover:scale-115 group-hover:rotate-[-8deg] group-hover:text-gray-900 pointer-events-none"
        >
          <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-0.5" />
        </button>
      </div>

      {/* Info Card Area with Smooth Rounded Top Overlap */}
      <div className="-mt-6 relative z-10 bg-white rounded-t-2xl px-5 py-6 sm:px-6 sm:py-6 text-center flex-1 flex flex-col justify-between group-hover:bg-[#FFF8F3] transition-colors duration-300">
        <div>
          <h3 className="text-2xl sm:text-[26px] font-therapique font-medium tracking-tight text-gray-800 leading-snug">
            {name}
          </h3>
          <p className="text-sm sm:text-base py-1 font-serif font-medium text-gray-500">
            {title}
          </p>
        </div>
        <p className="text-xs sm:text-sm font-sans font-medium text-gray-600 leading-snug pt-1">
          {description}
        </p>
      </div>
    </div>
  );
};

export default ProfileCard;
