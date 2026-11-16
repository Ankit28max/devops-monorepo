variable "aws_region" {
  description = "AWS region for infrastructure provisioning"
  type        = string
  default     = "ap-southeast-2"
}

variable "environment" {
  description = "Deployment environment name (e.g., prod, staging, dev)"
  type        = string
  default     = "production"
}

variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t3.small"
}

variable "key_name" {
  description = "Name of existing AWS EC2 SSH key pair (without .pem extension)"
  type        = string
  default     = "ankit"
}

variable "allowed_ssh_cidr" {
  description = "CIDR block permitted for administrative SSH access (port 22)"
  type        = string
  default     = "0.0.0.0/0"
}
