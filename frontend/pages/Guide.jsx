import { Card, PageHead } from '../ui';
export function Guide() {
  return (
    <div className="stack guide" style={{ maxWidth: 860 }}>
      <PageHead title="User guide" sub="Everything you need, in about two minutes." />
      <Card>
        <h3>Daily work in a class register</h3>
        <ul>
          <li>Open <b>Class registers</b> and choose a class. Each learner has one line per book.</li>
          <li><b>Register view</b>: tap an <b>ISSUED</b> cell to issue a book, tap again to record collected, lost (<b>LOST</b>) or damaged (<b>DMG</b>). Blue “OUT” cells are books still with the learner.</li>
          <li><b>Learners view</b> (best on phones): tap a learner to open their books, then tap a book.</li>
          <li><b>By book view</b>: choose one book and a working date, then use Issue / Collect / Lost / Dmg buttons down the class list — the quickest way to hand out or collect a whole class.</li>
          <li><b>Bulk</b>: issue one title to the whole class, or collect it from everyone, in a single step.</li>
          <li>When a book is marked lost or damaged you are offered <b>Log case</b>, so the incident log always matches the register.</li>
        </ul>
        <h3>Moving a learner to another class</h3>
        <p>Open <b>Learners</b> → the learner → <b>Move class</b>. Their book records move with them, and the history is kept. Learners who leave school are marked <b>left</b> (never deleted) so unreturned books stay visible in reports. To move many learners, use <b>Import</b> with an updated CSV (Adm No, Name, Class code) and tick “update existing”.</p>
        <h3>Stock</h3>
        <p>Issued, collected, lost and damaged counts flow in automatically. Enter <b>opening stock</b>, <b>purchases</b>, <b>withdrawals</b> and your <b>physical count</b> on the Stock page. <b>Variance</b> = physical count − expected in library. Replaced lost books (case status “Replaced”) add to total copies.</p>
        <h3>Lost & damaged cases</h3>
        <p>Cases move from <b>Under investigation</b> to <b>Pending replacement</b>, then <b>Replaced</b>, <b>Repaired</b> or <b>Waived</b> (these close the case). The Executive summary checks that register totals match logged cases for each class.</p>
        <h3>Books per class</h3>
        <p>Librarians can add titles and choose which books each class register carries under <b>Book titles → Class assignments</b>. Titles with records cannot be removed from a class until those records are cleared.</p>
        <h3>Roles</h3>
        <ul><li><b>Administrator</b> – everything, including users, settings, backup and restore.</li><li><b>Librarian</b> – all registers, learners, books, stock and cases.</li><li><b>Class teacher</b> – edits their own class register and reports cases; views everything else.</li><li><b>Head teacher</b> – view-only access to all pages, audit trail and snapshots.</li></ul>
        <h3>Printing & exports</h3>
        <p>Use <b>Print</b> on a register for an A4-landscape paper copy with signature lines. <b>CSV</b> buttons download spreadsheet files for Excel. <b>Reports → Snapshots</b> freezes the figures at the end of a term.</p>
        <h3>Keep it safe</h3>
        <p>Administrators should download a <b>backup</b> (Settings → Backup) regularly. Every change is recorded in the <b>Audit trail</b>.</p>
      </Card>
    </div>
  );
}
