import Link from "next/link";
export default function NotFound() {
  return (
    <main className="setup-container">
      <h1>Niet gevonden</h1>
      <p className="section-space">Dit item bestaat niet of is niet van jouw account.</p>
      <Link className="button" href="/home">
        Naar Home
      </Link>
    </main>
  );
}
