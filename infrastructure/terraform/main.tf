# CodeB Infrastructure - Terraform Configuration
#
# Vultr VPS 인프라를 코드로 관리합니다.
#
# 사용법:
#   1. cp terraform.tfvars.example terraform.tfvars
#   2. terraform.tfvars 파일에 API 키 설정
#   3. terraform init
#   4. terraform plan
#   5. terraform apply

terraform {
  required_version = ">= 1.0"

  required_providers {
    vultr = {
      source  = "vultr/vultr"
      version = "~> 2.0"
    }
  }

  # 상태 저장 (선택 - S3 또는 로컬)
  # backend "s3" {
  #   bucket = "codeb-terraform-state"
  #   key    = "production/terraform.tfstate"
  #   region = "ap-northeast-2"
  # }
}

# Vultr Provider 설정
provider "vultr" {
  api_key     = var.vultr_api_key
  rate_limit  = 100
  retry_limit = 3
}

# =====================================================
# SSH Key
# =====================================================
resource "vultr_ssh_key" "deploy" {
  name    = "codeb-deploy-key"
  ssh_key = var.ssh_public_key
}

# =====================================================
# VPS Instance
# =====================================================
resource "vultr_instance" "codeb_server" {
  # 플랜: vc2-2c-4gb (2 vCPU, 4GB RAM, 80GB SSD)
  plan = var.vultr_plan

  # 리전: 서울 (icn) 또는 도쿄 (nrt)
  region = var.vultr_region

  # OS: Ubuntu 22.04 LTS
  os_id = data.vultr_os.ubuntu.id

  # 라벨 및 호스트명
  label    = "${var.project_name}-${var.environment}"
  hostname = "${var.project_name}-${var.environment}"

  # SSH 키 연결
  ssh_key_ids = [vultr_ssh_key.deploy.id]

  # IPv6 활성화 (무료)
  enable_ipv6 = true

  # 자동 백업 활성화 (유료 - $1/월)
  backups = var.enable_backups ? "enabled" : "disabled"

  # DDOS 보호 (유료 - 특정 리전만)
  # ddos_protection = false

  # 부팅 시 실행 스크립트
  user_data = templatefile("${path.module}/scripts/user-data.sh", {
    project_name = var.project_name
    environment  = var.environment
  })

  # 태그
  tags = [
    var.project_name,
    var.environment,
    "managed-by-terraform"
  ]
}

# =====================================================
# DNS 설정
# =====================================================
resource "vultr_dns_domain" "main" {
  count = var.manage_dns ? 1 : 0

  domain   = var.domain
  dns_sec  = "disabled"  # DNSSEC 비활성화
}

# A 레코드 - 메인 도메인
resource "vultr_dns_record" "apex" {
  count = var.manage_dns ? 1 : 0

  domain = vultr_dns_domain.main[0].domain
  name   = ""
  type   = "A"
  data   = vultr_instance.codeb_server.main_ip
  ttl    = 300
}

# A 레코드 - 와일드카드 (*.codeb.dev)
resource "vultr_dns_record" "wildcard" {
  count = var.manage_dns ? 1 : 0

  domain = vultr_dns_domain.main[0].domain
  name   = "*"
  type   = "A"
  data   = vultr_instance.codeb_server.main_ip
  ttl    = 300
}

# A 레코드 - www
resource "vultr_dns_record" "www" {
  count = var.manage_dns ? 1 : 0

  domain = vultr_dns_domain.main[0].domain
  name   = "www"
  type   = "A"
  data   = vultr_instance.codeb_server.main_ip
  ttl    = 300
}

# =====================================================
# Firewall (방화벽 그룹)
# =====================================================
resource "vultr_firewall_group" "codeb" {
  description = "CodeB Server Firewall"
}

# SSH 접근 (포트 22)
resource "vultr_firewall_rule" "ssh" {
  firewall_group_id = vultr_firewall_group.codeb.id
  protocol          = "tcp"
  ip_type           = "v4"
  subnet            = var.allowed_ssh_cidr
  subnet_size       = split("/", var.allowed_ssh_cidr)[1]
  port              = "22"
  notes             = "SSH Access"
}

# HTTP (포트 80)
resource "vultr_firewall_rule" "http" {
  firewall_group_id = vultr_firewall_group.codeb.id
  protocol          = "tcp"
  ip_type           = "v4"
  subnet            = "0.0.0.0"
  subnet_size       = 0
  port              = "80"
  notes             = "HTTP"
}

# HTTPS (포트 443)
resource "vultr_firewall_rule" "https" {
  firewall_group_id = vultr_firewall_group.codeb.id
  protocol          = "tcp"
  ip_type           = "v4"
  subnet            = "0.0.0.0"
  subnet_size       = 0
  port              = "443"
  notes             = "HTTPS"
}

# =====================================================
# Data Sources
# =====================================================
data "vultr_os" "ubuntu" {
  filter {
    name   = "name"
    values = ["Ubuntu 22.04 LTS x64"]
  }
}

# =====================================================
# Outputs
# =====================================================
output "server_ip" {
  description = "서버 공인 IP"
  value       = vultr_instance.codeb_server.main_ip
}

output "server_ipv6" {
  description = "서버 IPv6"
  value       = vultr_instance.codeb_server.v6_main_ip
}

output "server_id" {
  description = "Vultr 인스턴스 ID"
  value       = vultr_instance.codeb_server.id
}

output "ssh_command" {
  description = "SSH 접속 명령어"
  value       = "ssh root@${vultr_instance.codeb_server.main_ip}"
}

output "dns_records" {
  description = "DNS 레코드 정보"
  value = var.manage_dns ? {
    apex     = "${var.domain} -> ${vultr_instance.codeb_server.main_ip}"
    wildcard = "*.${var.domain} -> ${vultr_instance.codeb_server.main_ip}"
  } : null
}
