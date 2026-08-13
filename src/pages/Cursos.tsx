import { useQuery } from "@tanstack/react-query";
import { GraduationCap } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { CardSkeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { fetchCourses } from "@/services/api";

export default function Cursos() {
  const { data: courses, isLoading } = useQuery({
    queryKey: ["courses"],
    queryFn: fetchCourses,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-display text-ink">Cursos</h1>
        <p className="mt-1 text-sm text-ink/50">
          Treinamentos publicados pelo time de gestão.
        </p>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : !courses || courses.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="Nenhum curso disponível"
          description="Assim que novos treinamentos forem publicados pelo Administrador, eles aparecerão aqui."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {courses.map((c) => (
            <Card key={c.id} className="p-5 transition-colors hover:border-forest-300">
              <Badge tone="neutral" className="mb-3">
                {c.categoria ?? "Geral"}
              </Badge>
              <h3 className="font-display text-[15px] font-semibold text-ink">
                {c.titulo}
              </h3>
              <p className="mt-1 text-sm text-ink/50">{c.descricao}</p>
              {c.link && (
                <a
                  href={c.link}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-block text-sm font-medium text-forest-600 hover:underline"
                >
                  Acessar curso
                </a>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
