import type { Project } from "./api";
import Collection from "./Collection";
export default function Competitors({ project }: { project: Project }) {
  return <Collection key={project.id} project={project} view="pages" />;
}
