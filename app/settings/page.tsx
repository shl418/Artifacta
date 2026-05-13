"use client"

import { Sidebar } from "@/components/sidebar"
import { Header } from "@/components/header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Building2,
  User,
  Palette,
  HardDrive,
  Save,
  Upload,
  Trash2,
  AlertTriangle,
} from "lucide-react"

export default function SettingsPage() {
  

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 p-2 pl-0">
        <main className="flex-1 flex flex-col bg-card rounded-xl shadow-sm overflow-hidden">
          <Header title="系统设置" />
          <div className="flex-1 overflow-y-auto p-6">
          <Tabs defaultValue="profile" className="space-y-6">
            <TabsList className="bg-secondary/50">
              <TabsTrigger value="profile" className="gap-2">
                <User className="h-4 w-4" />
                个人资料
              </TabsTrigger>
              <TabsTrigger value="organization" className="gap-2">
                <Building2 className="h-4 w-4" />
                组织设置
              </TabsTrigger>
              
              <TabsTrigger value="appearance" className="gap-2">
                <Palette className="h-4 w-4" />
                外观
              </TabsTrigger>
              <TabsTrigger value="storage" className="gap-2">
                <HardDrive className="h-4 w-4" />
                存储
              </TabsTrigger>
            </TabsList>

            {/* Profile Tab */}
            <TabsContent value="profile" className="space-y-6">
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle>个人资料</CardTitle>
                  <CardDescription>管理您的个人信息和账户设置</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Avatar */}
                  <div className="flex items-center gap-6">
                    <Avatar className="h-20 w-20">
                      <AvatarImage src="/placeholder-user.jpg" />
                      <AvatarFallback className="text-2xl bg-primary/20 text-primary">
                        张
                      </AvatarFallback>
                    </Avatar>
                    <div className="space-y-2">
                      <Button variant="secondary" size="sm">
                        <Upload className="h-4 w-4 mr-2" />
                        更换头像
                      </Button>
                      <p className="text-xs text-muted-foreground">
                        支持 JPG、PNG 格式，最大 2MB
                      </p>
                    </div>
                  </div>

                  {/* Form */}
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="name">姓名</Label>
                      <Input
                        id="name"
                        defaultValue="张三"
                        className="bg-secondary/50"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">邮箱</Label>
                      <Input
                        id="email"
                        type="email"
                        defaultValue="zhangsan@company.com"
                        className="bg-secondary/50"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="title">职位</Label>
                      <Input
                        id="title"
                        defaultValue="数据分析师"
                        className="bg-secondary/50"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="department">部门</Label>
                      <Select defaultValue="data">
                        <SelectTrigger className="bg-secondary/50">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="data">数据分析部</SelectItem>
                          <SelectItem value="product">产品部</SelectItem>
                          <SelectItem value="engineering">工程部</SelectItem>
                          <SelectItem value="marketing">市场部</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="bio">个人简介</Label>
                    <Textarea
                      id="bio"
                      placeholder="介绍一下自己..."
                      className="bg-secondary/50 resize-none"
                      rows={3}
                    />
                  </div>

                  <div className="flex justify-end">
                    <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">
                      <Save className="h-4 w-4 mr-2" />
                      保存更改
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Danger Zone */}
              <Card className="bg-card border-destructive/30">
                <CardHeader>
                  <CardTitle className="text-destructive flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5" />
                    危险操作
                  </CardTitle>
                  <CardDescription>
                    以下操作不可撤销，请谨慎操作
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-foreground">删除账户</p>
                      <p className="text-sm text-muted-foreground">
                        永久删除您的账户和所有数据
                      </p>
                    </div>
                    <Button variant="destructive">
                      <Trash2 className="h-4 w-4 mr-2" />
                      删除账户
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Organization Tab */}
            <TabsContent value="organization" className="space-y-6">
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle>组织信息</CardTitle>
                  <CardDescription>管理您的组织基本信息</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>组织名称</Label>
                      <Input
                        defaultValue="DataVision Inc."
                        className="bg-secondary/50"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>组织 ID</Label>
                      <Input
                        value="org_abc123xyz"
                        readOnly
                        className="bg-secondary/50 text-muted-foreground"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>组织描述</Label>
                    <Textarea
                      defaultValue="企业级数据可视化与 BI 分析平台"
                      className="bg-secondary/50 resize-none"
                      rows={2}
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">
                      <Save className="h-4 w-4 mr-2" />
                      保存更改
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            

            {/* Appearance Tab */}
            <TabsContent value="appearance" className="space-y-6">
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle>外观设置</CardTitle>
                  <CardDescription>自定义您的界面外观</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label>主题</Label>
                    <Select defaultValue="light">
                      <SelectTrigger className="w-48 bg-secondary/50">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="light">浅色</SelectItem>
                        <SelectItem value="dark">深色</SelectItem>
                        <SelectItem value="system">跟随系统</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>语言</Label>
                    <Select defaultValue="zh">
                      <SelectTrigger className="w-48 bg-secondary/50">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="zh">简体中文</SelectItem>
                        <SelectItem value="en">English</SelectItem>
                        <SelectItem value="ja">日本語</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Storage Tab */}
            <TabsContent value="storage" className="space-y-6">
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle>存储使用情况</CardTitle>
                  <CardDescription>查看和管理您的存储空间</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-foreground">已使用</span>
                      <span className="text-muted-foreground">24.5 MB / 1 GB</span>
                    </div>
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full"
                        style={{ width: "2.45%" }}
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="p-4 rounded-lg bg-secondary/30">
                      <p className="text-sm text-muted-foreground">看板文件</p>
                      <p className="text-xl font-semibold text-foreground mt-1">
                        18.2 MB
                      </p>
                    </div>
                    <div className="p-4 rounded-lg bg-secondary/30">
                      <p className="text-sm text-muted-foreground">数据集</p>
                      <p className="text-xl font-semibold text-foreground mt-1">
                        6.3 MB
                      </p>
                    </div>
                    <div className="p-4 rounded-lg bg-secondary/30">
                      <p className="text-sm text-muted-foreground">其他</p>
                      <p className="text-xl font-semibold text-foreground mt-1">
                        0 MB
                      </p>
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-4 border-t border-border">
                    <p className="text-sm text-muted-foreground">
                      需要更多存储空间？
                    </p>
                    <Button variant="secondary">升级套餐</Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>
      </div>
    </div>
  )
}
