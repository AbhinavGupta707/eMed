export default function HomePage() {
  return (
    <main style={{ margin: "0 auto", maxWidth: 720, padding: "64px 24px" }}>
      <h1 style={{ fontSize: "clamp(2rem, 8vw, 4rem)", margin: 0 }}>HomeRounds</h1>
      <p style={{ fontSize: "1.125rem", lineHeight: 1.6 }}>
        Adaptive asynchronous clinical rounds using synthetic data. The patient and clinician
        workflows are being assembled behind deterministic safety, quality, and audit contracts.
      </p>
      <p>This prototype is not clinically validated and must not be used for medical decisions.</p>
    </main>
  );
}
