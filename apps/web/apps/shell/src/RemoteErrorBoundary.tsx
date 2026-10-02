import React from 'react';

interface Props {
  name: string;
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Un micro-frontend injoignable ne doit pas vider toute l'application:
 * sans cette barrière, l'échec du import() distant démonte l'arbre React entier.
 */
class RemoteErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('Échec du chargement du micro-frontend', error);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div style={{ padding: '20px', border: '2px solid #e74c3c', borderRadius: '8px' }}>
        <h2>Module « {this.props.name} » indisponible</h2>
        <p>
          Le micro-frontend n'a pas pu être chargé. Vérifiez qu'il est bien démarré, puis rechargez
          la page.
        </p>
        <p style={{ color: '#7f8c8d' }}>{error.message}</p>
      </div>
    );
  }
}

export default RemoteErrorBoundary;
