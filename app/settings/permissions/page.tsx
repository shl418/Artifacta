"use client"

import { useState } from "react"
import { Sidebar } from "@/components/sidebar"
import { Header } from "@/components/header"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Switch } from "@/components/ui/switch"
import {
  Shield,
  Users,
  FileBarChart,
  Database,
  Settings,
  Crown,
  User,
} from "lucide-react"

// 简化为两种角色
const roles = [
  {
    id: "admin",
    name: "管理员",
    icon: Crown,
    description: "可以管理所有项目、成员和系统设置",
    color: "bg-primary/10 text-primary border-primary/20",
  },
  {
    id: "user",
    name: "使用者",
    icon: User,
    description: "可以创建项目，并管理自己创建的项目权限",
    color: "bg-accent/10 text-accent border-accent/20",
  },
]

// 权限矩阵
const permissions = [
  {
    category: "项目管理",
    icon: FileBarChart,
    items: [
      { name: "创建新项目", admin: true, user: true },
      { name: "查看所有项目", admin: true, user: false },
      { name: "编辑自己的项目", admin: true, user: true },
      { name: "删除自己的项目", admin: true, user: true },
      { name: "管理自己项目的成员权限", admin: true, user: true },
      { name: "编辑/删除他人项目", admin: true, user: false },
    ],
  },
  {
    category: "数据集管理",
    icon: Database,
    items: [
      { name: "上传数据集", admin: true, user: true },
      { name: "查看所有数据集", admin: true, user: false },
      { name: "管理自己的数据集", admin: true, user: true },
      { name: "删除他人数据集", admin: true, user: false },
    ],
  },
  {
    category: "团队管理",
    icon: Users,
    items: [
      { name: "查看团队成员", admin: true, user: true },
      { name: "邀请新成员", admin: true, user: false },
      { name: "移除成员", admin: true, user: false },
      { name: "修改成员角色", admin: true, user: false },
    ],
  },
  {
    category: "系统设置",
    icon: Settings,
    items: [
      { name: "查看系统设置", admin: true, user: false },
      { name: "修改系统设置", admin: true, user: false },
      { name: "查看审计日志", admin: true, user: false },
      { name: "管理 API 密钥", admin: true, user: true },
    ],
  },
]

export default function PermissionsPage() {
  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 p-2 pl-0">
        <main className="flex-1 flex flex-col bg-card rounded-xl shadow-sm overflow-hidden">
          <Header title="权限管理" />
          <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-5xl mx-auto space-y-6">
            {/* Role Cards */}
            <div className="grid gap-4 md:grid-cols-2">
              {roles.map((role) => {
                const Icon = role.icon
                return (
                  <Card key={role.id} className={`bg-card border-2 ${role.color}`}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${role.id === 'admin' ? 'bg-primary/20' : 'bg-accent/20'}`}>
                          <Icon className={`h-5 w-5 ${role.id === 'admin' ? 'text-primary' : 'text-accent'}`} />
                        </div>
                        <div>
                          <CardTitle className="text-lg">{role.name}</CardTitle>
                          <CardDescription className="mt-1">{role.description}</CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                  </Card>
                )
              })}
            </div>

            {/* Info Card */}
            <Card className="bg-secondary/30 border-border">
              <CardContent className="py-4">
                <div className="flex items-start gap-3">
                  <Shield className="h-5 w-5 text-primary mt-0.5" />
                  <div className="text-sm text-muted-foreground">
                    <p className="font-medium text-foreground mb-1">权限说明</p>
                    <p>使用者可以对自己创建的项目进行完全管理，包括设置其他成员对该项目的「可编辑」或「可查看」权限。管理员拥有系统的完全管理权限。SSO 登录已默认启用。</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Permission Matrix */}
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-lg">权限矩阵</CardTitle>
                <CardDescription>查看不同角色的权限配置</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {permissions.map((category) => {
                  const Icon = category.icon
                  return (
                    <div key={category.category}>
                      <div className="flex items-center gap-2 mb-3">
                        <Icon className="h-4 w-4 text-primary" />
                        <span className="font-medium text-foreground">{category.category}</span>
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow className="border-border hover:bg-transparent">
                            <TableHead className="text-muted-foreground w-[60%]">权限</TableHead>
                            <TableHead className="text-center text-muted-foreground">
                              <div className="flex items-center justify-center gap-1">
                                <Crown className="h-3 w-3" />
                                管理员
                              </div>
                            </TableHead>
                            <TableHead className="text-center text-muted-foreground">
                              <div className="flex items-center justify-center gap-1">
                                <User className="h-3 w-3" />
                                使用者
                              </div>
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {category.items.map((item) => (
                            <TableRow key={item.name} className="border-border">
                              <TableCell className="text-foreground text-sm">{item.name}</TableCell>
                              <TableCell className="text-center">
                                <div className="flex justify-center">
                                  <Switch checked={item.admin} disabled className="data-[state=checked]:bg-primary" />
                                </div>
                              </TableCell>
                              <TableCell className="text-center">
                                <div className="flex justify-center">
                                  <Switch checked={item.user} disabled className="data-[state=checked]:bg-accent" />
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
      </div>
    </div>
  )
}
