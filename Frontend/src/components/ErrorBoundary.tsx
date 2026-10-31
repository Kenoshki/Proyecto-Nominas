import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hayError: boolean;
}

/** Evita que un error de render deje la aplicación en blanco. */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hayError: false };

  static getDerivedStateFromError(): State {
    return { hayError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Error de interfaz', error, info.componentStack);
  }

  render() {
    if (this.state.hayError) {
      return (
        <div role="alert" className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
          <div className="bg-white rounded-xl shadow p-8 max-w-md text-center">
            <h2 className="text-xl font-bold text-gray-800 mb-2">Algo salió mal</h2>
            <p className="text-sm text-gray-600 mb-4">Ocurrió un error inesperado en la pantalla. Recarga la página para continuar.</p>
            <button onClick={() => window.location.reload()} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg">
              Recargar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
