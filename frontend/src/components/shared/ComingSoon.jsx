import './ComingSoon.css';

export default function ComingSoon({ moduleName = 'This Module' }) {
  return (
    <div className="coming-soon">
      <div className="coming-soon-inner">
        <p className="coming-soon-label">{moduleName}</p>
        <p className="coming-soon-sub">In Development</p>
      </div>
    </div>
  );
}
