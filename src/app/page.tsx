// Default entry route: sends demo visitors to the seeded experience.
import { redirect } from "next/navigation";

export default function HomePage() {
  redirect("/demo");
}
