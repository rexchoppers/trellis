import { useCallback, useEffect, useState } from 'react';
import { Projects } from '../wailsjs/go/main/App';
import type { setup } from '../wailsjs/go/models';
import { AddProject } from './views/AddProject';
import { ProjectView } from './views/ProjectView';
import { message } from './views/shared';
import { ProjectSwitcher, TitleBar, type Place } from './views/TitleBar';

export function App() {
  const [projects, setProjects] = useState<setup.ProjectStatus[]>();
  const [place, setPlace] = useState<Place>();
  const [error, setError] = useState<string>();

  const refresh = useCallback(
    () =>
      Projects()
        .then((loaded) => {
          setProjects(loaded);
          return loaded;
        })
        .catch((err) => {
          setError(message(err));
          return [];
        }),
    [],
  );

  const showFirst = (loaded: setup.ProjectStatus[]) => setPlace(loaded[0] ? { kind: 'project', path: loaded[0].path } : { kind: 'add' });

  useEffect(() => {
    refresh().then(showFirst);
  }, [refresh]);

  if (error) return <p className="p-8 text-sm text-destructive">{error}</p>;
  if (!projects) return null;

  const project = place?.kind === 'project' ? projects.find((candidate) => candidate.path === place.path) : undefined;
  const switcher = <ProjectSwitcher projects={projects} place={place} onSelect={setPlace} />;

  return (
    <div className="flex h-svh flex-col overflow-hidden bg-background text-foreground">
      {project ? (
        <ProjectView key={project.path} project={project} switcher={switcher} onRemoved={() => refresh().then(showFirst)} />
      ) : (
        <>
          <TitleBar>{switcher}</TitleBar>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-3xl px-6 pt-6 pb-16">
              <AddProject onAdded={(path) => refresh().then(() => setPlace({ kind: 'project', path }))} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
