output "instance_id" {
  description = "The ID of the EC2 instance"
  value       = aws_instance.app_server.id
}

output "public_ip" {
  description = "The static Elastic IP assigned to the instance"
  value       = aws_eip.app_eip.public_ip
}

output "ssh_command" {
  description = "Example command to SSH into the newly created server"
  value       = "ssh -i path/to/${var.key_name}.pem ubuntu@${aws_eip.app_eip.public_ip}"
}

output "security_group_id" {
  description = "The Security Group ID"
  value       = aws_security_group.web_sg.id
}

output "vpc_id" {
  description = "The VPC ID"
  value       = aws_vpc.main.id
}
