import { Link } from "react-router-dom";
export default function ForgotPassword() {
  return <div className="public-shell"><div className="public-panel max-w-md text-center">
    <h1 className="text-2xl font-bold">Esqueceu sua senha?</h1>
    <p className="mt-4 text-muted-foreground">Procure o administrador para definir uma nova senha.</p>
    <Link to="/login" className="mt-6 inline-block text-primary underline">Voltar ao login</Link>
  </div></div>;
}
