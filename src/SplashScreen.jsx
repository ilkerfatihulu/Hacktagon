import React from 'react';
import './SplashScreen.css';
import logo from '/KidneyGuard.png';

const SplashScreen = () => {
  return (
    <div className="splash-screen">
      <img src={logo} alt="KidneyGuard Logo" className="splash-logo" />
      <h1>KidneyGuard</h1>
    </div>
  );
};

export default SplashScreen;
