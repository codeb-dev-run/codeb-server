"use client";

import { useState, useEffect, useCallback } from "react";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Plus,
  Key,
  Eye,
  EyeOff,
  Copy,
  Edit,
  Trash2,
  Lock,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  Download,
  Upload,
  RotateCcw,
} from "lucide-react";

interface EnvVariable {
  id: string;
  key: string;
  value: string;
  isSecret: boolean;
}

interface Project {
  id: string;
  name: string;
}

export default function EnvPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [selectedEnv, setSelectedEnv] = useState<"production" | "staging">("production");
  const [envVars, setEnvVars] = useState<EnvVariable[]>([]);
  const [showValues, setShowValues] = useState<Record<string, boolean>>({});
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newIsSecret, setNewIsSecret] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backups, setBackups] = useState<string[]>([]);

  // 프로젝트 목록 로드
  useEffect(() => {
    async function loadProjects() {
      try {
        const res = await fetch("/api/ssot");
        const data = await res.json();
        if (data.success && data.projects) {
          const projectList = Object.keys(data.projects).map((name) => ({
            id: name,
            name,
          }));
          setProjects(projectList);
          if (projectList.length > 0 && !selectedProject) {
            setSelectedProject(projectList[0].name);
          }
        }
      } catch (err) {
        console.error("Failed to load projects:", err);
        // Fallback to default projects
        setProjects([
          { id: "worb", name: "worb" },
          { id: "codeb-dashboard", name: "codeb-dashboard" },
          { id: "codeb-cms", name: "codeb-cms" },
        ]);
        if (!selectedProject) {
          setSelectedProject("worb");
        }
      }
    }
    loadProjects();
  }, [selectedProject]);

  // ENV 변수 로드
  const loadEnvVars = useCallback(async () => {
    if (!selectedProject) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/env?project=${selectedProject}&env=${selectedEnv}&action=current`
      );
      const data = await res.json();

      if (data.success) {
        const vars = (data.data || []).map((v: { key: string; value: string; isSecret?: boolean }, i: number) => ({
          id: `${i}`,
          key: v.key,
          value: v.value,
          isSecret: v.isSecret ?? v.key.includes("SECRET") || v.key.includes("PASSWORD") || v.key.includes("KEY") || v.key.includes("TOKEN"),
        }));
        setEnvVars(vars);
      } else {
        setEnvVars([]);
      }
    } catch (err) {
      console.error("Failed to load ENV:", err);
      setError("ENV 변수를 불러오는데 실패했습니다");
      setEnvVars([]);
    } finally {
      setLoading(false);
    }
  }, [selectedProject, selectedEnv]);

  // 백업 목록 로드
  const loadBackups = useCallback(async () => {
    if (!selectedProject) return;

    try {
      const res = await fetch(
        `/api/env?project=${selectedProject}&action=backups`
      );
      const data = await res.json();

      if (data.success && data.data) {
        setBackups(data.data.map((b: { filename: string }) => b.filename));
      }
    } catch (err) {
      console.error("Failed to load backups:", err);
    }
  }, [selectedProject]);

  useEffect(() => {
    loadEnvVars();
    loadBackups();
  }, [loadEnvVars, loadBackups]);

  const toggleShowValue = (id: string) => {
    setShowValues((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const copyToClipboard = (value: string) => {
    navigator.clipboard.writeText(value);
  };

  // 변수 추가
  const handleAddVariable = async () => {
    if (!newKey.trim()) return;

    setLoading(true);
    try {
      const res = await fetch("/api/env", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project: selectedProject,
          environment: selectedEnv,
          action: "set",
          key: newKey.trim(),
          value: newValue,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setNewKey("");
        setNewValue("");
        setIsAddingNew(false);
        loadEnvVars();
      } else {
        setError(data.error || "변수 추가 실패");
      }
    } catch (err) {
      setError("변수 추가 중 오류 발생");
    } finally {
      setLoading(false);
    }
  };

  // 변수 삭제
  const handleDeleteVariable = async (key: string) => {
    if (!confirm(`정말 ${key}를 삭제하시겠습니까?`)) return;

    setLoading(true);
    try {
      const res = await fetch(
        `/api/env?project=${selectedProject}&env=${selectedEnv}&key=${key}`,
        { method: "DELETE" }
      );

      const data = await res.json();
      if (data.success) {
        loadEnvVars();
      } else {
        setError(data.error || "삭제 실패");
      }
    } catch (err) {
      setError("삭제 중 오류 발생");
    } finally {
      setLoading(false);
    }
  };

  // Master에서 복원
  const handleRestoreFromMaster = async () => {
    if (!confirm("master.env에서 복원하시겠습니까? 현재 변수가 모두 덮어씌워집니다.")) return;

    setLoading(true);
    try {
      const res = await fetch("/api/env", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project: selectedProject,
          environment: selectedEnv,
          action: "restore",
          version: "master",
        }),
      });

      const data = await res.json();
      if (data.success) {
        loadEnvVars();
      } else {
        setError(data.error || "복원 실패");
      }
    } catch (err) {
      setError("복원 중 오류 발생");
    } finally {
      setLoading(false);
    }
  };

  const secretCount = envVars.filter((v) => v.isSecret).length;
  const publicCount = envVars.filter((v) => !v.isSecret).length;

  return (
    <div className="flex flex-col h-full">
      <Header
        title="환경 변수"
        description="프로젝트 환경 변수 관리 (백업 서버 연동)"
      />

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Project & Environment Selector */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex-1 max-w-xs">
            <Select
              label="프로젝트"
              value={selectedProject}
              onChange={setSelectedProject}
              options={projects.map((p) => ({ value: p.name, label: p.name }))}
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setSelectedEnv("production")}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                selectedEnv === "production"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              프로덕션
            </button>
            <button
              onClick={() => setSelectedEnv("staging")}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                selectedEnv === "staging"
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              스테이징
            </button>
          </div>

          <div className="flex gap-2 ml-auto">
            <Button variant="outline" onClick={loadEnvVars} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              새로고침
            </Button>
            <Button variant="outline" onClick={handleRestoreFromMaster} disabled={loading}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Master 복원
            </Button>
            <Button onClick={() => setIsAddingNew(true)}>
              <Plus className="mr-2 h-4 w-4" />
              변수 추가
            </Button>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-5 w-5 text-red-600" />
                <span className="text-red-700">{error}</span>
                <button onClick={() => setError(null)} className="ml-auto text-red-600">
                  ✕
                </button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Warning for Production */}
        {selectedEnv === "production" && (
          <Card className="border-yellow-200 bg-yellow-50">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-medium text-yellow-900">프로덕션 환경</h4>
                  <p className="text-sm text-yellow-700 mt-1">
                    프로덕션 변수 변경은 배포 후 적용됩니다. 먼저 스테이징에서 테스트하세요.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
                  <Key className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{envVars.length}</p>
                  <p className="text-sm text-gray-500">전체 변수</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
                  <Lock className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{secretCount}</p>
                  <p className="text-sm text-gray-500">보안 변수</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100">
                  <CheckCircle className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{publicCount}</p>
                  <p className="text-sm text-gray-500">공개 변수</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100">
                  <Download className="h-5 w-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{backups.length}</p>
                  <p className="text-sm text-gray-500">백업 파일</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Variables Table */}
        <Card>
          <CardHeader>
            <CardTitle>
              환경 변수
              <span className="ml-2 text-sm font-normal text-gray-500">
                ({selectedProject} - {selectedEnv === "production" ? "프로덕션" : "스테이징"})
              </span>
              {loading && <RefreshCw className="inline ml-2 h-4 w-4 animate-spin" />}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {envVars.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Key className="h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900">환경 변수 없음</h3>
                <p className="text-sm text-gray-500 mt-1">
                  {loading ? "로딩 중..." : "첫 번째 환경 변수를 추가하세요"}
                </p>
                {!loading && (
                  <Button onClick={() => setIsAddingNew(true)} className="mt-4">
                    <Plus className="mr-2 h-4 w-4" />
                    변수 추가
                  </Button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-sm text-gray-500">
                      <th className="px-6 py-3 font-medium">키</th>
                      <th className="px-6 py-3 font-medium">값</th>
                      <th className="px-6 py-3 font-medium">타입</th>
                      <th className="px-6 py-3 font-medium">작업</th>
                    </tr>
                  </thead>
                  <tbody>
                    {envVars.map((variable) => (
                      <tr
                        key={variable.id}
                        className="border-b border-gray-100 hover:bg-gray-50"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <code className="text-sm font-mono font-medium text-gray-900">
                              {variable.key}
                            </code>
                            {variable.isSecret && (
                              <Lock className="h-3 w-3 text-gray-400" />
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2 max-w-md">
                            {variable.isSecret && !showValues[variable.id] ? (
                              <code className="text-sm font-mono text-gray-400">
                                ••••••••••••••••
                              </code>
                            ) : (
                              <code className="text-sm font-mono text-gray-700 truncate">
                                {variable.value}
                              </code>
                            )}
                            {variable.isSecret && (
                              <button
                                onClick={() => toggleShowValue(variable.id)}
                                className="text-gray-400 hover:text-gray-600"
                              >
                                {showValues[variable.id] ? (
                                  <EyeOff className="h-4 w-4" />
                                ) : (
                                  <Eye className="h-4 w-4" />
                                )}
                              </button>
                            )}
                            <button
                              onClick={() => copyToClipboard(variable.value)}
                              className="text-gray-400 hover:text-gray-600"
                            >
                              <Copy className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {variable.isSecret ? (
                            <Badge variant="warning">보안</Badge>
                          ) : (
                            <Badge variant="default">공개</Badge>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteVariable(variable.key)}
                            >
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Add New Variable Form */}
        {isAddingNew && (
          <Card className="border-blue-200 bg-blue-50">
            <CardHeader>
              <CardTitle>새 환경 변수 추가</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="키"
                  placeholder="DATABASE_URL"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                />
                <Input
                  label="값"
                  placeholder="postgres://..."
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                />
              </div>

              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="rounded"
                    checked={newIsSecret}
                    onChange={(e) => setNewIsSecret(e.target.checked)}
                  />
                  <span className="text-sm text-gray-700">보안 (값 숨기기)</span>
                </label>
              </div>

              <div className="flex gap-2 pt-4">
                <Button onClick={handleAddVariable} disabled={loading || !newKey.trim()}>
                  {loading ? "저장 중..." : "변수 저장"}
                </Button>
                <Button variant="outline" onClick={() => setIsAddingNew(false)}>
                  취소
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
