import React from "react";
import HeroSection from "../components/sections/HeroSection.jsx";
import HistorySection from "../components/sections/HistorySection.jsx";
import MethodologySection from "../components/sections/MethodologySection.jsx";
import BranchesSection from "../components/sections/BranchesSection.jsx";
import AboutSection from "../components/sections/AboutSection.jsx";
import ConceptSection from "../components/sections/ConceptSection.jsx";
import TeamSection from "../components/sections/TeamSection.jsx";
import ContactsSection from "../components/sections/ContactsSection.jsx";
const HomePage = () => {
  return (
    <div className="home-page">
      <HeroSection />
      <HistorySection />
      <MethodologySection />
      <BranchesSection />
      <AboutSection />
      <ConceptSection />
      <TeamSection />
      <ContactsSection />
      {/* Остальные секции будут здесь */}
    </div>
  );
};

export default HomePage;
