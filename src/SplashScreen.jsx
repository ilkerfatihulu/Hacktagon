import React from 'react';
import './SplashScreen.css'; // We'll create this CSS file next

const SplashScreen = () => {
  return (
    <div className="splash-screen">
      <img src="/KidneyGuard.png" alt="KidneyGuard Logo" className="splash-logo" />
      <div className="splash-text">KidneyGuard</div>
    </div>
  );
};

export default SplashScreen;
