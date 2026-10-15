import { connection } from "next/server";
import { Suspense } from "react";

import { getSchedules } from "@/lib/queries";

async function ScheduleTable() {
  // Query at request time, not at build time.
  await connection();
  const games = await getSchedules();

  return (
    <>
      <p>{games.length} games</p>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Week</th>
            <th>Type</th>
            <th>Away</th>
            <th>Score</th>
            <th>Home</th>
            <th>Score</th>
          </tr>
        </thead>
        <tbody>
          {games.map((g) => (
            <tr key={g.game_id}>
              <td>{g.gameday}</td>
              <td>{g.week}</td>
              <td>{g.game_type}</td>
              <td>{g.away_team}</td>
              <td>{g.away_score ?? ""}</td>
              <td>{g.home_team}</td>
              <td>{g.home_score ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

export default function Home() {
  return (
    <main className="p-4">
      <h1>2025 schedule</h1>
      <Suspense fallback={<p>Loading games…</p>}>
        <ScheduleTable />
      </Suspense>
    </main>
  );
}
