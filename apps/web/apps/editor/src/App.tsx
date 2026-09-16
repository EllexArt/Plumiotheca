import React from 'react';

const App: React.FC = () => {
  return (
    <div style={{ padding: '20px', border: '2px solid #3498db', borderRadius: '8px' }}>
      <h2>✍️ Module Écriture (Editor)</h2>
      <p>Ceci est le micro-frontend dédié à la création et l'édition d'histoires.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <input type="text" placeholder="Titre de votre histoire" style={{ padding: '8px' }} />
        <textarea placeholder="Il était une fois..." rows={5} style={{ padding: '8px' }}></textarea>
        <button style={{ padding: '10px', backgroundColor: '#3498db', color: 'white', border: 'none', borderRadius: '4px' }}>Publier</button>
      </div>
    </div>
  );
};

export default App;
