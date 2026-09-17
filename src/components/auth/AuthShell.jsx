import { ArrowUpRight, Boxes, BriefcaseBusiness, ShieldCheck, UsersRound } from "lucide-react";
import logo from "../../assets/images/bangalore-electronics-logo.png";
import "../../styles/people.css";

const AuthShell = ({ title, subtitle, children, helper }) => (
  <main className="be-auth">
    <section className="be-auth-story" aria-label="Bangalore Electronics workspace">
      <a className="be-auth-brand" href="/" aria-label="Bangalore Electronics home"><img src={logo} alt="Bangalore Electronics" /><span>Enterprise workspace</span></a>
      <div className="be-auth-intro">
        <span className="people-eyebrow">ONE CONNECTED WORKSPACE</span>
        <h2>Your people, projects<br />and operations.<br /><span>Working together.</span></h2>
        <p>A clear view of the work that matters. Keep teams aligned, resources accounted for, and every project moving forward.</p>
        <div className="be-auth-modules">
          {[[Boxes, "Inventory & procurement", "From planning to delivery"], [BriefcaseBusiness, "Project management", "From milestones to site activity"], [UsersRound, "People & HR", "From attendance to growth"]].map(([Icon, label, description]) => <div key={label}><Icon size={19} /><span><strong>{label}</strong><small>{description}</small></span><ArrowUpRight size={16} /></div>)}
        </div>
      </div>
      <div className="be-auth-foot"><ShieldCheck size={16} /><span>Secure access to your organization</span><span>Bangalore Electronics</span></div>
    </section>
    <section className="be-auth-entry">
      <div className="be-auth-form">
        <span className="people-eyebrow">BANGALORE ELECTRONICS ERP</span>
        <header><h1>{title}</h1><p>{subtitle}</p></header>
        {children}
        {helper && <div className="be-auth-helper">{helper}</div>}
        <footer>Access is managed by your workspace administrator.</footer>
      </div>
    </section>
  </main>
);
export default AuthShell;
