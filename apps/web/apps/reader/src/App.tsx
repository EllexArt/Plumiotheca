import React from 'react';

const App: React.FC = () => {
  return (
    <div style={{ padding: '20px', border: '2px solid #2ecc71', borderRadius: '8px' }}>
      <h2>📚 Module Lecture (Reader)</h2>
      <p>Ceci est le micro-frontend dédié à la lecture des histoires.</p>
      <ul>
        <li>Histoire 1 : Le mystère de la forêt</li>
        <li>Histoire 2 : Voyage interstellaire</li>
        <li>Histoire 3 : La plume magique</li>
      </ul>
    </div>
  );
};

export default App;
