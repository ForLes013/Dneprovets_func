import React from "react";

const Footer = () => {
  return (
    <footer
      style={{
        background: "var(--bg-secondary)",
        padding: "40px 20px",
        textAlign: "center",
        marginTop: "auto",
      }}
    >
      <p style={{ color: "var(--text-secondary)" }}>
        Футбольная школа "Днепровец" © 2025
      </p>
    </footer>
  );
};

export default Footer;
