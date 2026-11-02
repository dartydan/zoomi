import type { Project } from "./api";
import Collection from "./Collection";
export default function Backlinks({ project }: { project: Project }) {
  return <Collection key={project.id} project={project} view="links" />;
}
