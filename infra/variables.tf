variable "aws_region" {
  description = "AWS region to deploy in"
  type        = string
  default     = "ap-south-1" # Mumbai — closest to Sri Lanka, lowest latency
}

variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t3.small" # 2 vCPU, 2GB RAM — ~$15/month
}

variable "ssh_public_key_path" {
  description = "Path to your SSH public key file"
  type        = string
  default     = "~/.ssh/id_rsa.pub"
}
