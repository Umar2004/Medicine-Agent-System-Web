terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

# ── SSH Key Pair ──
resource "aws_key_pair" "deploy" {
  key_name   = "medicine-agent-deploy"
  public_key = file(var.ssh_public_key_path)
}

# ── Security Group ──
resource "aws_security_group" "web" {
  name        = "medicine-agent-web-sg"
  description = "Allow HTTP, HTTPS, and SSH"

  # SSH
  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"] # Restrict to your IP later
  }

  # HTTP
  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # HTTPS
  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # All outbound
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name    = "medicine-agent-web-sg"
    Project = "MedicineAgent"
  }
}

# ── EC2 Instance ──
resource "aws_instance" "web" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  key_name               = aws_key_pair.deploy.key_name
  vpc_security_group_ids = [aws_security_group.web.id]

  root_block_device {
    volume_size = 20
    volume_type = "gp3"
    encrypted   = true
  }

  user_data = <<-EOF
    #!/bin/bash
    set -e

    # Update system
    apt-get update && apt-get upgrade -y

    # Install Docker
    apt-get install -y ca-certificates curl gnupg
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
    apt-get update
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

    # Install Nginx
    apt-get install -y nginx

    # Install Certbot
    apt-get install -y certbot python3-certbot-nginx

    # Create app directory
    mkdir -p /opt/medicine-agent

    # Enable services
    systemctl enable docker
    systemctl enable nginx
    systemctl start docker
    systemctl start nginx

    echo "✅ Server setup complete" > /opt/medicine-agent/setup.log
  EOF

  tags = {
    Name    = "medicine-agent-web"
    Project = "MedicineAgent"
  }
}

# ── Elastic IP (free while attached) ──
resource "aws_eip" "web" {
  instance = aws_instance.web.id

  tags = {
    Name    = "medicine-agent-web-eip"
    Project = "MedicineAgent"
  }
}

# ── Latest Ubuntu 24.04 AMI ──
data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}
