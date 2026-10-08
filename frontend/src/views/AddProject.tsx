import { FolderOpen } from 'lucide-react';
import { useState } from 'react';
import { ChooseFolder, SaveProject } from '../../wailsjs/go/main/App';
import { setup } from '../../wailsjs/go/models';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, folderName, FormMessage, message, PageHeader, Section } from './shared';

export function AddProject({ onAdded }: { onAdded: (path: string) => void }) {
  const [path, setPath] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string>();
  const [saveError, setSaveError] = useState<string>();

  const choose = () => {
    setError(undefined);
    ChooseFolder()
      .then((chosen) => {
        if (!chosen) return;
        setPath(chosen);
        setName(folderName(chosen));
        setSaveError(undefined);
      })
      .catch((err) => setError(message(err)));
  };

  const save = () => {
    setSaveError(undefined);
    SaveProject(setup.ProjectInput.createFrom({ path, name }))
      .then((project) => onAdded(project.path))
      .catch((err) => setSaveError(message(err)));
  };

  return (
    <>
      <PageHeader title="Add project" subtitle="Trellis writes its settings to .trellis/ inside the project folder." />
      <Section title="Folder">
        <div className="flex items-center gap-3">
          <Button variant={path ? 'outline' : 'default'} onClick={choose}>
            <FolderOpen />
            {path ? 'Change folder' : 'Choose folder'}
          </Button>
          {path && <code className="truncate text-sm text-muted-foreground">{path}</code>}
        </div>
        <FormMessage error={error} />
      </Section>
      {path && (
        <Section title="Details">
          <form
            className="grid max-w-md gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
            <Field label="Name" htmlFor="project-name">
              <Input id="project-name" value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
            <FormMessage error={saveError} />
            <div>
              <Button type="submit">Add project</Button>
            </div>
          </form>
        </Section>
      )}
    </>
  );
}
