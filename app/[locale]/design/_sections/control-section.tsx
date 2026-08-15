"use client";

import { useState } from "react";

import { Accordion } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Field, FieldInput, FieldSelect } from "@/components/ui/field";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Switch } from "@/components/ui/switch";

const FAQ_ITEMS = [
  {
    id: "turnaround",
    question: "How long does grading take?",
    answer: "Turnaround depends on the service level. (Placeholder — client-supplied.)",
  },
  {
    id: "grade",
    question: "What does the grade mean?",
    answer:
      "Four sub-grades combine into a final score. (Placeholder — client-supplied.)",
  },
];

export function ControlSection() {
  const [filter, setFilter] = useState("all");
  const [insured, setInsured] = useState(true);

  return (
    <div>
      <h2 className="font-serif text-h2 text-ink">Controls</h2>

      <div className="mt-8 flex flex-wrap items-center gap-4">
        <Button>Submit a card</Button>
        <Button variant="ink">Secondary</Button>
        <Button variant="ghost">View pricing</Button>
        <Button size="sm">Small gold</Button>
        <Button variant="ghost" size="sm">
          Small ghost
        </Button>
        <Button disabled>Disabled</Button>
      </div>

      <div className="mt-8">
        <SegmentedControl
          label="Filter showcase"
          value={filter}
          onValueChange={setFilter}
          options={[
            { value: "all", label: "All" },
            { value: "sports", label: "Sports" },
            { value: "tcg", label: "TCG" },
          ]}
        />
      </div>

      <div className="mt-8 grid max-w-xl grid-cols-1 gap-x-4 sm:grid-cols-2">
        <Field label="Card / player name">
          <FieldInput placeholder="e.g. Charizard" />
        </Field>
        <Field label="Service level">
          <FieldSelect defaultValue="std">
            <option value="eco">Economy</option>
            <option value="std">Standard</option>
            <option value="exp">Express</option>
          </FieldSelect>
        </Field>
      </div>

      <div className="mt-4 flex items-center justify-between gap-5 border-t border-hairline pt-5 sm:max-w-xl">
        <div>
          <div className="font-semibold text-ink">Insured return shipping</div>
          <div className="text-sm text-muted">Full declared-value coverage</div>
        </div>
        <Switch
          label="Insured return shipping"
          checked={insured}
          onCheckedChange={setInsured}
        />
      </div>

      <div className="mt-10 max-w-2xl">
        <Accordion items={FAQ_ITEMS} />
      </div>
    </div>
  );
}
